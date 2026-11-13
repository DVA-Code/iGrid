"""Build current archives, including the sanitized GitHub source candidate."""
from pathlib import Path
import subprocess,sys
subprocess.run([sys.executable,str(Path(__file__).with_name('package-source.py'))],check=True)
