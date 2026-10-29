"""Room AI tokenizer configuration and exact-count tests."""

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from tokenizers import Tokenizer, models, pre_tokenizers

from src.core.config import settings
from src.services.room_tokenizer import _load_tokenizer, count_room_ai_prompt_tokens


class FakeTokenizer:
    @classmethod
    def from_file(cls, path):
        return cls(path)

    def __init__(self, path):
        self.path = path

    def encode(self, text):
        return SimpleNamespace(ids=[self.path, text])

    def no_truncation(self):
        pass


class TestRoomTokenizer(unittest.TestCase):
    def setUp(self):
        _load_tokenizer.cache_clear()

    def tearDown(self):
        _load_tokenizer.cache_clear()

    def test_counts_with_local_tokenizer_matching_configured_model(self):
        fake_module = SimpleNamespace(Tokenizer=FakeTokenizer)
        with patch.dict(sys.modules, {"tokenizers": fake_module}), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch.object(settings, "ROOM_AI_TOKENIZER_MODEL", "configured-model", create=True), patch.object(
            settings, "ROOM_AI_TOKENIZER_FILE", "/models/tokenizer.json", create=True
        ):
            self.assertEqual(count_room_ai_prompt_tokens("prompt"), 2)

    def test_rejects_missing_or_mismatched_tokenizer_before_loading(self):
        fake_module = SimpleNamespace(Tokenizer=FakeTokenizer)
        with patch.dict(sys.modules, {"tokenizers": fake_module}), patch.object(
            settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
        ), patch.object(settings, "ROOM_AI_TOKENIZER_MODEL", "different-model", create=True), patch.object(
            settings, "ROOM_AI_TOKENIZER_FILE", "/models/tokenizer.json", create=True
        ):
            with self.assertRaisesRegex(RuntimeError, "matching Room AI tokenizer"):
                count_room_ai_prompt_tokens("prompt")

    def test_ignores_tokenizer_file_truncation_when_counting_prompt(self):
        tokenizer = Tokenizer(
            models.WordLevel(vocab={"[UNK]": 0, "token": 1}, unk_token="[UNK]")
        )
        tokenizer.pre_tokenizer = pre_tokenizers.Whitespace()
        tokenizer.enable_truncation(max_length=512)
        with tempfile.TemporaryDirectory() as temp_dir:
            tokenizer_file = Path(temp_dir) / "tokenizer.json"
            tokenizer.save(str(tokenizer_file))
            _load_tokenizer.cache_clear()
            with patch.object(
                settings, "ROOM_AI_SELF_HOSTED_MODEL", "configured-model", create=True
            ), patch.object(settings, "ROOM_AI_TOKENIZER_MODEL", "configured-model", create=True), patch.object(
                settings, "ROOM_AI_TOKENIZER_FILE", str(tokenizer_file), create=True
            ):
                self.assertEqual(count_room_ai_prompt_tokens("token " * 15_000), 15_000)
