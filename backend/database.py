import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# When running as frozen exe, .env lives next to the executable
if getattr(sys, 'frozen', False):
    _BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    _BASE_DIR = os.path.dirname(os.path.abspath(__file__))

load_dotenv(os.path.join(_BASE_DIR, '.env'))

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no configurado. "
        f"Creá un archivo .env en {_BASE_DIR} con:\n"
        "DATABASE_URL=postgresql://usuario:clave@host/db?sslmode=require"
    )

# pool_pre_ping retries dead connections automatically at query time
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
