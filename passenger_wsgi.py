"""cPanel Passenger entry point; mount at /research (or the chosen application URL)."""
import os, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
os.environ['GML_MODE']='production'
from python_backend.app import application
