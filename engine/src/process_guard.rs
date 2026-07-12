use std::io;
use std::process::Child;

#[cfg(windows)]
mod platform {
    use super::*;
    use std::ffi::c_void;
    use std::mem::size_of;
    use std::ptr;

    type Bool = i32;
    type Dword = u32;
    type Handle = *mut c_void;

    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
    const JOB_OBJECT_LIMIT_ACTIVE_PROCESS: Dword = 0x0000_0008;
    const JOB_OBJECT_LIMIT_PROCESS_MEMORY: Dword = 0x0000_0100;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: Dword = 0x0000_2000;
    const PROCESS_TERMINATE: Dword = 0x0001;
    const PROCESS_SET_QUOTA: Dword = 0x0100;
    const PROCESS_QUERY_LIMITED_INFORMATION: Dword = 0x1000;

    #[repr(C)]
    #[derive(Default)]
    struct BasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: Dword,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: Dword,
        affinity: usize,
        priority_class: Dword,
        scheduling_class: Dword,
    }

    #[repr(C)]
    #[derive(Default)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    struct ExtendedLimitInformation {
        basic_limit_information: BasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> Handle;
        fn SetInformationJobObject(
            job: Handle,
            class: i32,
            information: *const c_void,
            information_length: Dword,
        ) -> Bool;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> Bool;
        fn TerminateJobObject(job: Handle, exit_code: u32) -> Bool;
        fn OpenProcess(desired_access: Dword, inherit_handle: Bool, process_id: Dword) -> Handle;
        fn CloseHandle(handle: Handle) -> Bool;
    }

    pub(crate) struct ProcessGuard {
        job: Handle,
    }

    impl ProcessGuard {
        pub(crate) fn assign(
            child: &Child,
            memory_limit_mb: usize,
            process_limit: u32,
        ) -> io::Result<Self> {
            // SAFETY: null attributes/name create an unnamed job owned by this process.
            let job = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
            if job.is_null() {
                return Err(io::Error::last_os_error());
            }
            let mut limits = ExtendedLimitInformation::default();
            limits.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                | JOB_OBJECT_LIMIT_PROCESS_MEMORY;
            limits.basic_limit_information.active_process_limit = process_limit.max(1);
            limits.process_memory_limit = memory_limit_mb.max(1).saturating_mul(1024 * 1024);
            // SAFETY: `limits` has the layout required by information class 9.
            if unsafe {
                SetInformationJobObject(
                    job,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                    (&limits as *const ExtendedLimitInformation).cast(),
                    size_of::<ExtendedLimitInformation>() as Dword,
                )
            } == 0
            {
                let error = io::Error::last_os_error();
                unsafe { CloseHandle(job) };
                return Err(error);
            }
            // SAFETY: child.id() identifies the live process returned by Command::spawn.
            let process = unsafe {
                OpenProcess(
                    PROCESS_TERMINATE | PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION,
                    0,
                    child.id(),
                )
            };
            if process.is_null() {
                let error = io::Error::last_os_error();
                unsafe { CloseHandle(job) };
                return Err(error);
            }
            // SAFETY: both handles are live for the duration of the call.
            let assigned = unsafe { AssignProcessToJobObject(job, process) };
            unsafe { CloseHandle(process) };
            if assigned == 0 {
                let error = io::Error::last_os_error();
                unsafe { CloseHandle(job) };
                return Err(error);
            }
            Ok(Self { job })
        }

        pub(crate) fn terminate(&self) {
            // SAFETY: `job` remains valid until Drop.
            unsafe {
                TerminateJobObject(self.job, 1);
            }
        }
    }

    impl Drop for ProcessGuard {
        fn drop(&mut self) {
            // KILL_ON_JOB_CLOSE ensures descendants cannot outlive the request.
            unsafe {
                CloseHandle(self.job);
            }
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;

    pub(crate) struct ProcessGuard;

    impl ProcessGuard {
        pub(crate) fn assign(
            _child: &Child,
            _memory_limit_mb: usize,
            _process_limit: u32,
        ) -> io::Result<Self> {
            Ok(Self)
        }

        pub(crate) fn terminate(&self) {}
    }
}

pub(crate) use platform::ProcessGuard;
