#![cfg_attr(not(windows), allow(dead_code))]

#[cfg(not(windows))]
fn main() {
    eprintln!("lumen-console-runner solo esta disponible en Windows.");
    std::process::exit(1);
}

#[cfg(windows)]
mod windows {
    use std::env;
    use std::ffi::{OsStr, OsString};
    use std::fs::{self, OpenOptions};
    use std::io::{self, Write};
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};
    use std::process::{self, Command, Stdio};
    use std::time::Instant;

    type Bool = i32;
    type Dword = u32;
    type Handle = *mut std::ffi::c_void;
    type Wchar = u16;

    const STD_INPUT_HANDLE: Dword = -10_i32 as Dword;
    const STD_OUTPUT_HANDLE: Dword = -11_i32 as Dword;
    const ENABLE_LINE_INPUT: Dword = 0x0002;
    const ENABLE_ECHO_INPUT: Dword = 0x0004;
    const ENABLE_VIRTUAL_TERMINAL_PROCESSING: Dword = 0x0004;
    const KEY_EVENT: u16 = 0x0001;

    #[repr(C)]
    struct InputRecord {
        event_type: u16,
        padding: u16,
        event: [u32; 4],
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetStdHandle(n_std_handle: Dword) -> Handle;
        fn SetConsoleMode(console_handle: Handle, mode: Dword) -> Bool;
        fn GetConsoleMode(console_handle: Handle, mode: *mut Dword) -> Bool;
        fn ReadConsoleInputW(
            console_input: Handle,
            buffer: *mut InputRecord,
            length: Dword,
            events_read: *mut Dword,
        ) -> Bool;
        fn SetConsoleTitleW(console_title: *const Wchar) -> Bool;
    }

    enum Action {
        Run {
            executable: PathBuf,
            arguments: Vec<OsString>,
        },
        Report {
            exit_code: i32,
            report_file: PathBuf,
        },
    }

    struct Options {
        title: OsString,
        lock_file: PathBuf,
        lock_token: Option<String>,
        no_wait: bool,
        action: Action,
    }

    struct LockFile {
        path: PathBuf,
    }

    impl LockFile {
        fn create(path: PathBuf, token: Option<&str>) -> Result<Self, String> {
            if let Some(parent) = path
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
            {
                fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "No se pudo crear el directorio del lock file '{}': {error}",
                        parent.display()
                    )
                })?;
            }
            if let Some(token) = token {
                let reservation = fs::read_to_string(&path).map_err(|error| {
                    format!("No se pudo leer la reserva '{}': {error}", path.display())
                })?;
                let expected_suffix = format!(":{token}");
                if !reservation.trim().starts_with("reservation:")
                    || !reservation.trim().ends_with(&expected_suffix)
                {
                    return Err("La reserva de consola no coincide con este proceso.".to_owned());
                }
                fs::write(&path, process::id().to_string()).map_err(|error| {
                    format!("No se pudo reclamar el lock '{}': {error}", path.display())
                })?;
            } else {
                let mut file = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&path)
                    .map_err(|error| {
                        format!("No se pudo adquirir el lock '{}': {error}", path.display())
                    })?;
                file.write_all(process::id().to_string().as_bytes())
                    .map_err(|error| {
                        format!("No se pudo escribir el lock '{}': {error}", path.display())
                    })?;
            }
            Ok(Self { path })
        }
    }

    impl Drop for LockFile {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
        }
    }

    struct ConsoleModeGuard {
        handle: Handle,
        original_mode: Dword,
    }

    impl Drop for ConsoleModeGuard {
        fn drop(&mut self) {
            // SAFETY: `handle` is the console input handle used to obtain `original_mode`.
            unsafe {
                SetConsoleMode(self.handle, self.original_mode);
            }
        }
    }

    pub fn main() {
        let options = match parse_options(env::args_os().skip(1).collect()) {
            Ok(options) => options,
            Err(message) => {
                eprintln!("{message}");
                print_usage();
                process::exit(1);
            }
        };

        set_console_title(&options.title);
        enable_virtual_terminal_processing();

        let lock = match LockFile::create(options.lock_file, options.lock_token.as_deref()) {
            Ok(lock) => lock,
            Err(message) => {
                eprintln!("{message}");
                wait_after_error(options.no_wait);
                process::exit(1);
            }
        };

        let exit_code = match options.action {
            Action::Run {
                executable,
                arguments,
            } => run_program(&executable, &arguments, options.no_wait),
            Action::Report {
                exit_code,
                report_file,
            } => show_report(&report_file, exit_code, options.no_wait),
        };

        // `process::exit` does not run destructors, so remove the lock explicitly first.
        drop(lock);
        process::exit(exit_code);
    }

    fn parse_options(args: Vec<OsString>) -> Result<Options, String> {
        let mut args = args.into_iter();
        let command = args
            .next()
            .ok_or_else(|| "Falta el comando run o report.".to_owned())?;
        let mut title = None;
        let mut lock_file = None;
        let mut lock_token = None;
        let mut exit_code = None;
        let mut no_wait = false;
        let mut positional = Vec::new();

        while let Some(argument) = args.next() {
            match argument.to_str() {
                Some("--title") => title = Some(required_value(&mut args, "--title")?),
                Some("--lock") => {
                    lock_file = Some(PathBuf::from(required_value(&mut args, "--lock")?))
                }
                Some("--lock-token") => {
                    lock_token = Some(
                        required_value(&mut args, "--lock-token")?
                            .to_string_lossy()
                            .into_owned(),
                    )
                }
                Some("--exit-code") => {
                    let value = required_value(&mut args, "--exit-code")?;
                    exit_code = Some(
                        value
                            .to_str()
                            .ok_or_else(|| "--exit-code debe ser un entero valido.".to_owned())?
                            .parse::<i32>()
                            .map_err(|_| "--exit-code debe ser un entero i32 valido.".to_owned())?,
                    );
                }
                Some("--no-wait") => no_wait = true,
                _ => positional.push(argument),
            }
        }

        let title = title.ok_or_else(|| "Falta --title <titulo>.".to_owned())?;
        let lock_file = lock_file.ok_or_else(|| "Falta --lock <lockfile>.".to_owned())?;

        let action = if command == "run" {
            if exit_code.is_some() {
                return Err("--exit-code solo es valido con report.".to_owned());
            }
            let executable = positional
                .first()
                .map(|value| PathBuf::from(value.as_os_str()))
                .ok_or_else(|| "Falta <exePath>.".to_owned())?;
            Action::Run {
                executable,
                arguments: positional.into_iter().skip(1).collect(),
            }
        } else if command == "report" {
            if positional.len() != 1 {
                return Err("report requiere exactamente un <reportFile>.".to_owned());
            }
            Action::Report {
                exit_code: exit_code.ok_or_else(|| "Falta --exit-code <n>.".to_owned())?,
                report_file: PathBuf::from(positional[0].as_os_str()),
            }
        } else {
            return Err("El comando debe ser run o report.".to_owned());
        };

        Ok(Options {
            title,
            lock_file,
            lock_token,
            no_wait,
            action,
        })
    }

    fn required_value(
        args: &mut impl Iterator<Item = OsString>,
        flag: &str,
    ) -> Result<OsString, String> {
        args.next()
            .ok_or_else(|| format!("Falta el valor de {flag}."))
    }

    fn print_usage() {
        eprintln!("Uso:");
        eprintln!("  lumen-console-runner run --title <titulo> --lock <lockfile> <exePath>");
        eprintln!("  lumen-console-runner report --title <titulo> --lock <lockfile> --exit-code <n> <reportFile>");
    }

    fn run_program(executable: &Path, arguments: &[OsString], no_wait: bool) -> i32 {
        if !executable.is_absolute() {
            eprintln!(
                "La ruta del ejecutable debe ser absoluta: '{}'",
                executable.display()
            );
            wait_after_error(no_wait);
            return 1;
        }
        if !executable.is_file() {
            eprintln!("El ejecutable no existe: '{}'", executable.display());
            wait_after_error(no_wait);
            return 1;
        }

        let working_directory = executable.parent().unwrap_or_else(|| Path::new("."));
        let started = Instant::now();
        let status = Command::new(executable)
            .args(arguments)
            .current_dir(working_directory)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .status();

        let status = match status {
            Ok(status) => status,
            Err(error) => {
                eprintln!("No se pudo ejecutar '{}': {error}", executable.display());
                wait_after_error(no_wait);
                return 1;
            }
        };
        let elapsed = started.elapsed().as_secs_f64();
        let exit_code = status.code().unwrap_or(-1);
        print!(
            "\nProcess returned {} (0x{:X})   execution time : {:.3} s",
            exit_code, exit_code, elapsed
        );
        prompt_and_wait(no_wait);
        exit_code
    }

    fn show_report(report_file: &Path, exit_code: i32, no_wait: bool) -> i32 {
        match fs::read_to_string(report_file) {
            Ok(report) => print!("{report}"),
            Err(error) => eprintln!(
                "No se pudo leer el reporte '{}': {error}",
                report_file.display()
            ),
        }
        let _ = fs::remove_file(report_file);
        print!("\nProcess returned {exit_code} (0x{exit_code:X})\n");
        prompt_and_wait(no_wait);
        exit_code
    }

    fn wait_after_error(no_wait: bool) {
        prompt_and_wait(no_wait);
    }

    fn prompt_and_wait(no_wait: bool) {
        print!("\nPress any key to continue.\n");
        let _ = io::stdout().flush();
        if !no_wait {
            if let Err(error) = wait_for_key() {
                eprintln!("No se pudo esperar una tecla: {error}");
            }
        }
    }

    fn wait_for_key() -> io::Result<()> {
        // SAFETY: GetStdHandle has no preconditions. Its result is validated by GetConsoleMode.
        let handle = unsafe { GetStdHandle(STD_INPUT_HANDLE) };
        let mut original_mode = 0;
        // SAFETY: `original_mode` is a valid writable pointer and `handle` is used read-only.
        if unsafe { GetConsoleMode(handle, &mut original_mode) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let raw_mode = original_mode & !(ENABLE_LINE_INPUT | ENABLE_ECHO_INPUT);
        // SAFETY: `handle` was validated as a console handle by GetConsoleMode.
        if unsafe { SetConsoleMode(handle, raw_mode) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let _mode_guard = ConsoleModeGuard {
            handle,
            original_mode,
        };

        loop {
            let mut record = InputRecord {
                event_type: 0,
                padding: 0,
                event: [0; 4],
            };
            let mut events_read = 0;
            // SAFETY: `record` and `events_read` are valid writable buffers for one event.
            if unsafe { ReadConsoleInputW(handle, &mut record, 1, &mut events_read) } == 0 {
                return Err(io::Error::last_os_error());
            }
            if events_read == 1 && record.event_type == KEY_EVENT && record.event[0] != 0 {
                return Ok(());
            }
        }
    }

    fn set_console_title(title: &OsStr) {
        let wide: Vec<u16> = title.encode_wide().chain(Some(0)).collect();
        // SAFETY: `wide` is a valid, NUL-terminated UTF-16 buffer for the duration of the call.
        unsafe {
            SetConsoleTitleW(wide.as_ptr());
        }
    }

    fn enable_virtual_terminal_processing() {
        // SAFETY: GetStdHandle has no preconditions. Its result is validated by GetConsoleMode.
        let handle = unsafe { GetStdHandle(STD_OUTPUT_HANDLE) };
        let mut mode = 0;
        // SAFETY: `mode` is writable. SetConsoleMode is called only if this is a console handle.
        if unsafe { GetConsoleMode(handle, &mut mode) } != 0 {
            unsafe {
                SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
            }
        }
    }
}

#[cfg(windows)]
fn main() {
    windows::main();
}
