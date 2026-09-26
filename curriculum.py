"""ML building quiz answer keys (server-side)."""

from __future__ import annotations

# building_id -> list of correct choice indices
ML_QUIZ_KEYS: dict[str, list[int]] = {
    "ml-101": [1, 1, 0],
    "perceptron": [1, 0, 0],
    "features-lab": [1, 0, 0],
    "linear-regression": [0, 0, 0],
    "svm": [0, 0, 0],
    "decision-trees": [0, 0, 0],
    "knn": [0, 0, 0],
    "kmeans": [0, 0, 0],
    "pca": [0, 0, 0],
    "mlp": [0, 0, 0],
    "cnn-intro": [0, 0, 0],
    "bandits": [0, 0, 0],
    "q-learning": [0, 0, 0],
}


def score_building_quiz(district: str, building_id: str, answers: list[int]) -> tuple[float, int, int]:
    if district != "ml":
        raise ValueError(f"Unsupported district: {district}")
    keys = ML_QUIZ_KEYS.get(building_id)
    if not keys:
        raise ValueError(f"Unknown building: {building_id}")
    if len(answers) != len(keys):
        raise ValueError("answers length mismatch")
    correct_count = sum(1 for a, c in zip(answers, keys) if a == c)
    total = len(keys)
    score = (correct_count / total) * 100.0
    return score, correct_count, total
