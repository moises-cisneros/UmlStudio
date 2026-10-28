"""Exact local token counting for the configured Room AI model."""

from functools import lru_cache

from ..core.config import settings


class RoomTokenizerUnavailableError(RuntimeError):
    """A matching, loadable tokenizer is required before private inference."""


@lru_cache(maxsize=1)
def _load_tokenizer(tokenizer_file: str):
    try:
        from tokenizers import Tokenizer
    except ImportError as exc:
        raise RoomTokenizerUnavailableError("Room AI tokenizer support is unavailable") from exc

    try:
        tokenizer = Tokenizer.from_file(tokenizer_file)
        # The model artifact may enable max-length truncation, but this function
        # must count every token in the assembled prompt before inference.
        tokenizer.no_truncation()
        return tokenizer
    except Exception as exc:
        raise RoomTokenizerUnavailableError("Room AI tokenizer could not be loaded") from exc


def count_room_ai_prompt_tokens(prompt: str) -> int:
    model = settings.ROOM_AI_SELF_HOSTED_MODEL.strip()
    tokenizer_model = settings.ROOM_AI_TOKENIZER_MODEL.strip()
    tokenizer_file = settings.ROOM_AI_TOKENIZER_FILE.strip()
    if not model or not tokenizer_file or tokenizer_model != model:
        raise RoomTokenizerUnavailableError("A matching Room AI tokenizer is not configured")

    try:
        return len(_load_tokenizer(tokenizer_file).encode(prompt).ids)
    except RoomTokenizerUnavailableError:
        raise
    except Exception as exc:
        raise RoomTokenizerUnavailableError("Room AI prompt could not be tokenized") from exc
