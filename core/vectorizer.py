"""Vector embedding and hybrid similarity matching engine.

Uses Google Gemini text-embedding-004 for domain-aware embeddings,
combined with keyword overlap scoring for accurate skill matching.
"""

from __future__ import annotations

import os
import re
from collections import Counter

import numpy as np
from google import genai
from google.genai import types as genai_types

from core.models import ActivityBullet, ATSRubricItem, VectorMatch

# ── Gemini Embedding ─────────────────────────────────────────────────────────

EMBEDDING_MODEL = "text-embedding-004"

# Scoring weights for hybrid matching
SEMANTIC_WEIGHT = 0.55   # Gemini embedding cosine similarity
KEYWORD_WEIGHT = 0.30    # Exact keyword / phrase overlap
CONTEXT_WEIGHT = 0.15    # Job-title / domain context bonus


def _get_client() -> genai.Client:
    """Return a configured Gemini client."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY environment variable is not set.")
    return genai.Client(api_key=api_key)


def embed_texts_gemini(texts: list[str], task_type: str = "SEMANTIC_SIMILARITY") -> list[list[float]]:
    """Embed texts using Gemini text-embedding-004.

    Args:
        texts: List of strings to embed.
        task_type: One of SEMANTIC_SIMILARITY, RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY,
                   CLASSIFICATION, CLUSTERING.
    """
    client = _get_client()
    # Gemini embedding API accepts batches up to 100
    all_vectors = []
    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=batch,
            config=genai_types.EmbedContentConfig(task_type=task_type),
        )
        all_vectors.extend([e.values for e in result.embeddings])
    return all_vectors


# ── Structured Text Builders ─────────────────────────────────────────────────

def _build_activity_text(activity: ActivityBullet) -> str:
    """Build structured text for an activity bullet.

    Leads with skills and action (where the matchable signal is),
    then adds situation context and impact. This ensures the embedding
    captures the *capabilities* demonstrated, not just the narrative.
    """
    parts = []
    # Lead with extracted skills if available (strongest signal)
    if activity.extracted_skills:
        parts.append(f"Skills: {', '.join(activity.extracted_skills)}")
    # Action is where tools/technologies are described — put it early
    if activity.action:
        parts.append(f"Action: {activity.action}")
    if activity.job_title:
        parts.append(f"Role: {activity.job_title}")
    if activity.situation:
        parts.append(f"Context: {activity.situation}")
    if activity.impact:
        parts.append(f"Result: {activity.impact}")
    return ". ".join(parts)


def _build_rubric_query(item: ATSRubricItem) -> str:
    """Build a query-style text for a rubric item.

    Leads with the skill group label and all ATS keywords for strong signal,
    then adds context from the situation/action descriptions.
    """
    parts = [f"Skill: {item.item}"]
    if item.ats_keywords:
        parts.append(f"Keywords: {', '.join(item.ats_keywords)}")
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
    """Extract all keyword/phrases from a rubric item.

    Uses the ats_keywords list (which contains all grouped keywords),
    plus the item label itself. This means a rubric item for
    "Containerization (Docker, Kubernetes)" with ats_keywords
    ["Docker", "Kubernetes", "containerization", "containers"]
    will match on any of those terms.
    """
    phrases = set()
    # Add all explicit ATS keywords
    for kw in item.ats_keywords:
        phrases.add(kw.lower().strip())
    # Add the item label itself
    phrases.add(item.item.lower().strip())
    return list(phrases)


def _keyword_overlap_score(
    keyphrases: list[str],
    activity: ActivityBullet,
) -> float:
    """Score how well the activity matches the rubric's key terms.

    Uses extracted_skills (AI-identified, includes synonyms) as the primary
    match source, with raw text as fallback. This means an activity that says
    "container orchestration" will match "Kubernetes" because the skill
    extraction step identified both.

    Returns 0.0 to 1.0.
    """
    # Build the searchable text: extracted skills + raw S/A/I
    raw_text = f"{activity.situation} {activity.action} {activity.impact}".lower()
    skill_text = " ".join(activity.extracted_skills).lower() if activity.extracted_skills else ""
    combined = f"{skill_text} {raw_text}"
    combined_tokens = set(_tokenize(combined))

    # Check for full phrase matches (highest signal)
    phrase_matches = 0
    for phrase in keyphrases:
        if phrase in combined:
            phrase_matches += 1

    if phrase_matches > 0:
        return min(1.0, 0.7 + 0.3 * (phrase_matches / len(keyphrases)))

    # Fall back to token-level overlap
    keyphrase_tokens = set()
    for phrase in keyphrases:
        keyphrase_tokens.update(_tokenize(phrase))

    if not keyphrase_tokens:
        return 0.0

    matched = keyphrase_tokens & combined_tokens
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

        # 2. Keyword / phrase overlap (uses extracted skills + raw text)
        kw_score = _keyword_overlap_score(keyphrases, activity)

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


def deduplicate_rubric(
    rubric_items: list[ATSRubricItem],
    similarity_threshold: float = 0.88,
) -> list[ATSRubricItem]:
    """Merge rubric items whose vectors are too similar.

    If two items have cosine similarity >= threshold, merge the lower-priority
    one into the higher-priority one by combining their ats_keywords.

    Priority order: critical > important > nice_to_have.
    """
    if not rubric_items or not rubric_items[0].vector:
        return rubric_items

    priority_rank = {"critical": 0, "important": 1, "nice_to_have": 2}

    # Build similarity matrix
    n = len(rubric_items)
    to_merge: list[tuple[int, int]] = []  # (keep_idx, merge_idx)

    for i in range(n):
        for j in range(i + 1, n):
            sim = cosine_similarity(rubric_items[i].vector, rubric_items[j].vector)
            if sim >= similarity_threshold:
                # Keep the higher-priority item (lower rank number)
                rank_i = priority_rank.get(rubric_items[i].priority, 1)
                rank_j = priority_rank.get(rubric_items[j].priority, 1)
                if rank_i <= rank_j:
                    to_merge.append((i, j))
                else:
                    to_merge.append((j, i))

    # Resolve merge chains: if A merges into B and B merges into C, A should merge into C
    merge_target: dict[int, int] = {}
    for keep, drop in to_merge:
        # Follow chain to find ultimate target
        while keep in merge_target:
            keep = merge_target[keep]
        merge_target[drop] = keep

    # Apply merges
    merged_indices: set[int] = set()
    for drop_idx, keep_idx in merge_target.items():
        merged_indices.add(drop_idx)
        keeper = rubric_items[keep_idx]
        dropped = rubric_items[drop_idx]

        # Combine ats_keywords (deduplicated)
        existing = {kw.lower() for kw in keeper.ats_keywords}
        for kw in dropped.ats_keywords:
            if kw.lower() not in existing:
                keeper.ats_keywords.append(kw)
                existing.add(kw.lower())

        # Append the dropped item's label to keywords if not already there
        if dropped.item.lower() not in existing:
            keeper.ats_keywords.append(dropped.item)

    # Return only non-merged items
    result = [item for i, item in enumerate(rubric_items) if i not in merged_indices]

    # Re-number IDs
    for i, item in enumerate(result):
        item.rubric_id = f"ATS-{i + 1:03d}"

    return result


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
