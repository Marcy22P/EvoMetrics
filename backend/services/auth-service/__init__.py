# Wrapper per importazione come modulo
import sys
from pathlib import Path

# Aggiungi il percorso corrente al PYTHONPATH
sys.path.insert(0, str(Path(__file__).parent))

from main import app

__all__ = ["app"]

