mod compile;
mod protocol;
mod state;
mod storage;

use std::io::{self, BufRead, Write};
use std::path::Path;

use protocol::{invalid_utf8_response, Engine};

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
        let bytes_read = reader
            .read_until(b'\n', &mut line)
            .map_err(|error| format!("No se pudo leer stdin: {error}"))?;

        if bytes_read == 0 {
            return Ok(());
        }

        let response = match std::str::from_utf8(&line) {
            Ok(text) => engine.handle_line(text),
            Err(_) => invalid_utf8_response(),
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
