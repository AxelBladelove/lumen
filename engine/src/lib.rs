mod compile;
pub mod esex;
pub mod manifest;
mod process_guard;
mod protocol;
mod state;
mod storage;
pub mod testing;
mod workspace;

use std::io::{self, BufRead, Write};
use std::path::Path;

use protocol::{invalid_utf8_response, Engine};

const MAX_REQUEST_LINE_BYTES: usize = 1024 * 1024;

pub fn serve(data_dir: &Path) -> Result<(), String> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    serve_io(data_dir, stdin.lock(), stdout.lock())
}

fn serve_io(
    data_dir: &Path,
    mut reader: impl BufRead,
    mut writer: impl Write,
) -> Result<(), String> {
    let mut engine = Engine::new(data_dir);
    let mut line = Vec::new();

    loop {
        line.clear();
        let (bytes_read, exceeded_limit) =
            read_line_limited(&mut reader, &mut line, MAX_REQUEST_LINE_BYTES)
                .map_err(|error| format!("No se pudo leer stdin: {error}"))?;

        if bytes_read == 0 {
            return Ok(());
        }

        let response = if exceeded_limit {
            protocol::invalid_request_response()
        } else {
            match std::str::from_utf8(&line) {
                Ok(text) => engine.handle_line(text),
                Err(_) => invalid_utf8_response(),
            }
        };

        serde_json::to_writer(&mut writer, &response)
            .map_err(|error| format!("No se pudo serializar la response: {error}"))?;
        writer
            .write_all(b"\n")
            .map_err(|error| format!("No se pudo escribir stdout: {error}"))?;
        writer
            .flush()
            .map_err(|error| format!("No se pudo hacer flush de stdout: {error}"))?;
    }
}

fn read_line_limited(
    reader: &mut impl BufRead,
    output: &mut Vec<u8>,
    limit: usize,
) -> io::Result<(usize, bool)> {
    let mut total = 0_usize;
    let mut exceeded = false;
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() {
            return Ok((total, exceeded));
        }
        let newline = buffer.iter().position(|byte| *byte == b'\n');
        let consumed = newline.map_or(buffer.len(), |index| index + 1);
        total = total.saturating_add(consumed);
        if output.len() < limit {
            let retained = consumed.min(limit - output.len());
            output.extend_from_slice(&buffer[..retained]);
            exceeded |= retained < consumed;
        } else {
            exceeded = true;
        }
        reader.consume(consumed);
        if newline.is_some() {
            return Ok((total, exceeded));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn oversized_lines_are_drained_before_the_next_request() {
        let mut reader = Cursor::new(b"0123456789\nok\n".to_vec());
        let mut line = Vec::new();
        let (read, exceeded) = read_line_limited(&mut reader, &mut line, 5).unwrap();
        assert_eq!(read, 11);
        assert!(exceeded);
        assert_eq!(line, b"01234");

        line.clear();
        let (read, exceeded) = read_line_limited(&mut reader, &mut line, 5).unwrap();
        assert_eq!(read, 3);
        assert!(!exceeded);
        assert_eq!(line, b"ok\n");
    }
}
