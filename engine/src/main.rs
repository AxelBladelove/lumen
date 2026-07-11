use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<OsString> = env::args_os().skip(1).collect();
    if args.first().is_some_and(|arg| arg == "build-esex") {
        return run_build_esex(&args);
    }

    let data_dir = match parse_data_dir(args.into_iter()) {
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

fn run_build_esex(args: &[OsString]) -> ExitCode {
    if args.len() != 3 {
        eprintln!("Uso: lumen-engine build-esex <activity_dir> <output.esex>");
        return ExitCode::FAILURE;
    }
    let activity_dir = PathBuf::from(&args[1]);
    let output_path = PathBuf::from(&args[2]);
    match lumen_engine::esex::build_esex(&activity_dir, &output_path) {
        Ok(info) => {
            println!("{}", info.package_sha256);
            ExitCode::SUCCESS
        }
        Err(errors) => {
            for error in errors {
                eprintln!("{} [{}]: {}", error.code, error.path, error.message);
            }
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
