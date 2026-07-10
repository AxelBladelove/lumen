use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let data_dir = match parse_data_dir(env::args_os().skip(1)) {
        Ok(path) => path,
        Err(message) => {
            eprintln!("{message}");
            eprintln!("Uso: lumen-engine --data-dir <ruta absoluta>");
            return ExitCode::FAILURE;
        }
    };

    match lumen_engine::serve(&data_dir) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("El loop del protocolo termino con error: {error}");
            ExitCode::FAILURE
        }
    }
}

fn parse_data_dir(mut args: impl Iterator<Item = OsString>) -> Result<PathBuf, String> {
    let flag = args.next();
    let value = args.next();
    let extra = args.next();

    if flag.as_deref() != Some(std::ffi::OsStr::new("--data-dir")) || extra.is_some() {
        return Err("Argumentos invalidos.".to_owned());
    }

    let path = value
        .map(PathBuf::from)
        .ok_or_else(|| "Falta el valor de --data-dir.".to_owned())?;

    if !path.is_absolute() {
        return Err("--data-dir debe ser una ruta absoluta.".to_owned());
    }

    Ok(path)
}
