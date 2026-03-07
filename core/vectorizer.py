"""Vector embedding and hybrid similarity matching engine.

Uses Google Gemini text-embedding-004 for domain-aware embeddings,
combined with keyword overlap scoring for accurate skill matching.
"""

from __future__ import annotations

import os
import re
from collections import Counter

import numpy as np
import google.generativeai as genai

from core.models import ActivityBullet, ATSRubricItem, VectorMatch

# ── Gemini Embedding ─────────────────────────────────────────────────────────

EMBEDDING_MODEL = "text-embedding-004"

# Scoring weights for hybrid matching
SEMANTIC_WEIGHT = 0.55   # Gemini embedding cosine similarity
KEYWORD_WEIGHT = 0.30    # Exact keyword / phrase overlap
CONTEXT_WEIGHT = 0.15    # Job-title / domain context bonus


def _configure_gemini():
    """Ensure Gemini API is configured."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)


def embed_texts_gemini(texts: list[str], task_type: str = "SEMANTIC_SIMILARITY") -> list[list[float]]:
    """Embed texts using Gemini text-embedding-004.

    Args:
        texts: List of strings to embed.
        task_type: One of SEMANTIC_SIMILARITY, RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY,
                   CLASSIFICATION, CLUSTERING.
    """
    _configure_gemini()
    # Gemini embedding API accepts batches up to 100
    all_vectors = []
    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        result = genai.embed_content(
            model=f"models/{EMBEDDING_MODEL}",
            content=batch,
            task_type=task_type,
        )
        all_vectors.extend(result["embedding"])
    return all_vectors


# ── Structured Text Builders ─────────────────────────────────────────────────

def _build_activity_text(activity: ActivityBullet) -> str:
    """Build structured text for an activity bullet.

    Separates S/A/I with labels so the embedding model understands
    the role of each part rather than treating it as flat text.
    """
    parts = []
    if activity.situation:
        parts.append(f"Situation: {activity.situation}")
    if activity.action:
        parts.append(f"Action: {activity.action}")
    if activity.impact:
        parts.append(f"Impact: {activity.impact}")
    if activity.job_title:
        parts.append(f"Role: {activity.job_title}")
    return ". ".join(parts)


def _build_rubric_query(item: ATSRubricItem) -> str:
    """Build a query-style text for a rubric item.

    Leads with the keyword/skill for strong signal, then adds
    context from the situation/action descriptions.
    """
    # Lead with the core skill/keyword (repeated for emphasis)
    parts = [f"Skill: {item.item}"]
    if item.situation_description:
        parts.append(f"Context: {item.situation_description}")
    if item.action_description:
        parts.append(f"Demonstrated by: {item.action_description}")
    return ". ".join(parts)


# ── Keyword Overlap Scoring ──────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    """Lowercase tokenize, stripping punctuation."""
    return re.findall(r"[a-z][a-z0-9+#.\-]*", text.lower())


def _extract_keyphrases(item: ATSRubricItem) -> list[str]:
    """Extract the core keyword/phrases from a rubric item.

    Returns the main item as-is (lowercased) plus individual tokens.
    This allows matching both "ci/cd pipelines" as a phrase and
    "ci/cd" and "pipelines" individually.
    """
    phrases = [item.item.lower().strip()]
    # Also split on common delimiters for sub-phrases
    for part in re.split(r"[,/&]|\band\b", item.item.lower()):
        part = part.strip()
        if part and part != phrases[0]:
            phrases.append(part)
    return phrases


def _keyword_overlap_score(
    keyphrases: list[str],
    activity_text: str,
) -> float:
    """Score how well the activity text contains the rubric's key terms.

    Returns 0.0 to 1.0:
    - Full phrase match = 1.0
    - Partial token overlap = proportional
    """
    text_lower = activity_text.lower()
    activity_tokens = set(_tokenize(text_lower))

    # Check for full phrase matches first (highest signal)
    phrase_matches = 0
    for phrase in keyphrases:
        if phrase in text_lower:
            phrase_matches += 1

    if phrase_matches > 0:
        # At least one full phrase matched — strong signal
        return min(1.0, 0.7 + 0.3 * (phrase_matches / len(keyphrases)))

    # Fall back to token-level overlap
    keyphrase_tokens = set()
    for phrase in keyphrases:
        keyphrase_tokens.update(_tokenize(phrase))

    if not keyphrase_tokens:
        return 0.0

    matched = keyphrase_tokens & activity_tokens
    return len(matched) / len(keyphrase_tokens)


def _context_score(
    rubric_item: ATSRubricItem,
    activity: ActivityBullet,
) -> float:
    """Bonus score for domain/role context overlap.

    Checks if the activity's job title or broader text shares domain
    language with the rubric's descriptions.
    """
    rubric_tokens = set(_tokenize(
        f"{rubric_item.situation_description} {rubric_item.action_description}"
    ))
    activity_tokens = set(_tokenize(
        f"{activity.job_title} {activity.situation} {activity.action} {activity.impact}"
    ))

    # Remove very common stop words
    stop = {"the", "a", "an", "and", "or", "to", "in", "of", "for", "with", "on", "at", "by", "is", "was", "are", "were", "be", "been", "being", "that", "this", "it"}
    rubric_tokens -= stop
    activity_tokens -= stop

    if not rubric_tokens:
        return 0.0

    overlap = rubric_tokens & activity_tokens
    return min(1.0, len(overlap) / max(len(rubric_tokens) * 0.3, 1))


# ── Core Vectorization Functions ─────────────────────────────────────────────

def vectorize_activity_bank(activities: list[ActivityBullet]) -> list[ActivityBullet]:
    """Embed all activities using Gemini with structured text."""
    texts = [_build_activity_text(a) for a in activities]
    vectors = embed_texts_gemini(texts, task_type="RETRIEVAL_DOCUMENT")
    for activity, vector in zip(activities, vectors):
        activity.vector = vector
    return activities


def vectorize_ats_rubric(rubric_items: list[ATSRubricItem]) -> list[ATSRubricItem]:
    """Embed all ATS rubric items using Gemini with query-style text."""
    texts = [_build_rubric_query(item) for item in rubric_items]
    vectors = embed_texts_gemini(texts, task_type="RETRIEVAL_QUERY")
    for item, vector in zip(rubric_items, vectors):
        item.vector = vector
    return rubric_items


# ── Matching Engine ──────────────────────────────────────────────────────────

def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two normalized vectors."""
    a = np.array(vec_a)
    b = np.array(vec_b)
    return float(np.dot(a, b))


def find_top_matches(
    rubric_item: ATSRubricItem,
    activities: list[ActivityBullet],
    top_k: int = 3,
) -> list[VectorMatch]:
    """Find the top-k matching activities using hybrid scoring.

    Hybrid score = (SEMANTIC_WEIGHT * cosine_sim)
                 + (KEYWORD_WEIGHT * keyword_overlap)
                 + (CONTEXT_WEIGHT * context_overlap)
    """
    if not rubric_item.vector:
        raise ValueError(f"Rubric item {rubric_item.rubric_id} has no vector")

    keyphrases = _extract_keyphrases(rubric_item)

    scores: list[tuple[float, ActivityBullet]] = []
    for activity in activities:
        if not activity.vector:
            continue

        # 1. Semantic similarity from Gemini embeddings
        sem_score = cosine_similarity(rubric_item.vector, activity.vector)

        # 2. Keyword / phrase overlap
        activity_text = f"{activity.situation} {activity.action} {activity.impact}"
        kw_score = _keyword_overlap_score(keyphrases, activity_text)

        # 3. Context / domain overlap bonus
        ctx_score = _context_score(rubric_item, activity)

        # Hybrid combination
        hybrid = (
            SEMANTIC_WEIGHT * sem_score
            + KEYWORD_WEIGHT * kw_score
            + CONTEXT_WEIGHT * ctx_score
        )

        scores.append((hybrid, activity))

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
