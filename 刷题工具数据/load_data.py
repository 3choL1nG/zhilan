"""Read the user's selected exam dataset without mixing answer sources."""
import json
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent

@lru_cache(maxsize=None)
def _read(relative_path):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))

def load_manifest():
    return _read("manifest.json")

def load_theory():
    return _read("data/theory_questions.json")

def load_practical():
    return _read("data/practical_questions.json")

def load_exam_config():
    return _read("data/exam_config.json")

def get_theory_question(question_id):
    return next(q for q in load_theory() if q["id"] == question_id)

def get_practical_question(question_id):
    return next(q for q in load_practical() if q["id"] == question_id)

def practical_answer_images(question_id):
    return [ROOT / page["image"] for page in get_practical_question(question_id)["answer_pages"]]
