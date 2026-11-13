"""Linux-only app-scoped collector start/stop/status. Does not kill by port or name."""
import argparse
import json
import os
import signal
import subprocess
import sys
import time
import uuid
from python_backend.config import ROOT,load_config
from python_backend.runtime import process_matches,runtime_dir


def record():
    try:return json.loads((runtime_dir()/'collector.pid.json').read_text())
    except (OSError,ValueError):return {}


def status():
    info=record()
    if info and process_matches(info):
        print('Collector running (PID '+str(info['pid'])+'). MQTT data health is shown in the dashboard.')
        return True
    print('No matching GML collector is running. A stale PID record is never used to stop another process.')
    return False


def start():
    if process_matches(record()):return status()
    from .preflight import checks
    failures=[label for label,ok in checks() if not ok]
    if failures:
        for label in failures:print('FAIL '+label)
        raise SystemExit('Run python -m deploy.setup and python -m deploy.preflight before starting.')
    os.umask(0o077)
    token=uuid.uuid4().hex
    with (runtime_dir()/'collector.log').open('ab') as log:
        child=subprocess.Popen([sys.executable,'-m','python_backend.collector','--instance',token],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,close_fds=True)
    for _ in range(50):
        if child.poll() is not None:raise SystemExit('Collector did not start. Check the private collector.log.')
        if record().get('instance')==token and process_matches(record()):return status()
        time.sleep(.1)
    raise SystemExit('Collector startup is not confirmed. Check status and private collector.log before retrying.')


def stop():
    info=record()
    if not process_matches(info):return status()
    pid=int(info['pid'])
    if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):
        raise SystemExit('Safe process control needs Linux pidfd support (kernel 5.3+). Use your approved supervisor to stop this collector.')
    try:handle=os.pidfd_open(pid)
    except ProcessLookupError:return status()
    try:
        if not process_matches(info):raise SystemExit('Process identity changed; no signal was sent.')
        signal.pidfd_send_signal(handle,signal.SIGTERM)
        for _ in range(100):
            if not process_matches(info):print('Collector stopped. Stored history is preserved.');return True
            time.sleep(.1)
        raise SystemExit('Collector has not exited after 10 seconds. Check its private log or use the host supervisor; no unrelated process was terminated.')
    finally:os.close(handle)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['start','stop','status']);args=parser.parse_args()
    if sys.platform!='linux':raise SystemExit('These deployment controls run on the Linux cPanel host; use npm.cmd run stop on Windows.')
    load_config()
    return {'start':start,'stop':stop,'status':status}[args.action]()


if __name__=='__main__':
    try:main()
    except (OSError,ValueError):raise SystemExit('Collector control failed. Check private configuration and permissions; no credentials were printed.') from None
