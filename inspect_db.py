import os
import sys

base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(base_dir, 'backend'))

from sqlalchemy.orm import Session
from backend.database import SessionLocal
import backend.models as models

db = SessionLocal()
member = db.query(models.Member).filter(models.Member.dni == '00000').first()
if member:
    print(f"Name: {member.name}")
    print(f"Status: {member.status}")
    print(f"Additional Plans: {member.additional_plans}")
else:
    print("Member not found")
