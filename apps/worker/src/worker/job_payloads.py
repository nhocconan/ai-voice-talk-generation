"""Typed payloads for worker job streams."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkerPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class IngestJobPayload(WorkerPayload):
    profile_id: str = Field(alias="profileId")
    storage_key: str = Field(alias="storageKey")
    version: int
    user_id: str = Field(default="", alias="userId")
    notes: str | None = None


class AsrJobPayload(WorkerPayload):
    generation_id: str = Field(alias="generationId")
    source_key: str = Field(alias="sourceKey")
    expected_speakers: int = Field(default=2, alias="expectedSpeakers")


class RenderSegmentPayload(WorkerPayload):
    start_ms: int = Field(alias="startMs")
    end_ms: int = Field(alias="endMs")
    text: str


class RenderSpeakerPayload(WorkerPayload):
    label: str
    profile_id: str = Field(alias="profileId")
    segments: list[RenderSegmentPayload] = Field(default_factory=list)
    script: str | None = None


class RenderOutputPayload(WorkerPayload):
    mp3: bool = True
    wav: bool = True
    chapters: bool = False


class RenderJobPayload(WorkerPayload):
    generation_id: str = Field(alias="generationId")
    provider_id: str = Field(alias="providerId")
    kind: Literal["PRESENTATION", "PODCAST", "REVOICE"]
    speakers: list[RenderSpeakerPayload] = Field(default_factory=list)
    output: RenderOutputPayload = Field(default_factory=RenderOutputPayload)
    pacing_lock: bool = Field(default=False, alias="pacingLock")
