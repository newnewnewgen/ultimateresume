"""Vector embedding and similarity matching engine."""

from __future__ import annotations

import numpy as np
from sentence_transformers import SentenceTransformer

from core.models import ActivityBullet, ATSRubricItem, VectorMatch

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    """Lazy-load the sentence transformer model."""
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def embed_text(text: str) -> list[float]:
    """Embed a single text string into a vector."""
    model = get_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in a batch for efficiency."""
    model = get_model()
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)
    return vectors.tolist()


def vectorize_activity_bank(activities: list[ActivityBullet]) -> list[ActivityBullet]:
    """Add vector embeddings to all activities in the bank."""
    texts = [a.combined_text for a in activities]
    vectors = embed_texts(texts)
    for activity, vector in zip(activities, vectors):
        activity.vector = vector
    return activities


def vectorize_ats_rubric(rubric_items: list[ATSRubricItem]) -> list[ATSRubricItem]:
    """Add vector embeddings to all ATS rubric items."""
    texts = [
        f"{item.item} {item.situation_description} {item.action_description}"
        for item in rubric_items
    ]
    vectors = embed_texts(texts)
    for item, vector in zip(rubric_items, vectors):
        item.vector = vector
    return rubric_items


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a = np.array(vec_a)
    b = np.array(vec_b)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def find_top_matches(
    rubric_item: ATSRubricItem,
    activities: list[ActivityBullet],
    top_k: int = 3,
) -> list[VectorMatch]:
    """Find the top-k most similar activity bullets for a rubric item."""
    if not rubric_item.vector:
        raise ValueError(f"Rubric item {rubric_item.rubric_id} has no vector")

    scores: list[tuple[float, ActivityBullet]] = []
    for activity in activities:
        if not activity.vector:
            continue
        score = cosine_similarity(rubric_item.vector, activity.vector)
        scores.append((score, activity))

    scores.sort(key=lambda x: x[0], reverse=True)
    top = scores[:top_k]

    return [
        VectorMatch(
            rubric_id=rubric_item.rubric_id,
            bullet_id=activity.bullet_id,
            similarity_score=score,
            activity=activity,
        )
        for score, activity in top
    ]


def find_all_matches(
    rubric_items: list[ATSRubricItem],
    activities: list[ActivityBullet],
    top_k: int = 3,
) -> dict[str, list[VectorMatch]]:
    """Find top matches for every rubric item against the activity bank."""
    results: dict[str, list[VectorMatch]] = {}
    for item in rubric_items:
        results[item.rubric_id] = find_top_matches(item, activities, top_k)
    return results
