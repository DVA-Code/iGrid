"""Single-collector lock and Linux process identity used by deployment controls."""
import json
import os
from pathlib import Path
from .config import ROOT, database_path


def runtime_dir():
    directory = database_path().parent
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    return directory


def process_start(pid):
    # Field 22, after the parenthesized comm field (which may contain spaces).
    return (Path('/proc') / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()[19]


def process_matches(record):
    try:
        pid = int(record['pid'])
        base = Path('/proc') / str(pid)
        args = (base / 'cmdline').read_bytes().split(b'\0')
        return (pid > 1 and process_start(pid) == record['start']
                and (base / 'cwd').resolve() == ROOT
                and b'python_backend.collector' in args
                and str(record['instance']).encode() in args)
    except (OSError, ValueError, KeyError, IndexError):
        return False


class CollectorLock:
    def __init__(self, instance):
        self.path = runtime_dir() / 'collector.pid.json'
        self.handle = (runtime_dir() / 'collector.lock').open('a+b')
        try:
            if os.name == 'nt':
                import msvcrt
                self.handle.seek(0)
                if not self.handle.read(1):
                    self.handle.write(b'0'); self.handle.flush()
                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.handle.close()
            raise RuntimeError('A collector already owns this database') from None
        if os.name != 'nt':
            os.chmod(runtime_dir() / 'collector.lock', 0o600)
            record = {'pid': os.getpid(), 'start': process_start(os.getpid()), 'instance': instance}
            fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w') as stream:
                json.dump(record, stream)

    def close(self):
        if os.name != 'nt':
            try:
                if json.loads(self.path.read_text()).get('pid') == os.getpid():
                    self.path.unlink()
            except (OSError, ValueError):
                pass
        self.handle.close()
