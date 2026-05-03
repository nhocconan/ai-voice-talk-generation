"""OpenTelemetry tracing setup and span helpers (NFR)."""

from __future__ import annotations

import contextlib
import os
from collections.abc import Generator
from typing import Any

from .logging import get_logger

logger = get_logger("tracing")

_tracer = None


def setup_tracing() -> None:
    """Initialize OTEL tracing if OTEL_EXPORTER_OTLP_ENDPOINT is set."""
    global _tracer  # noqa: PLW0603

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    service_name = os.environ.get("OTEL_SERVICE_NAME", "yng-voice-worker")

    try:
        from opentelemetry import trace  # type: ignore[import]
        from opentelemetry.sdk.resources import Resource  # type: ignore[import]
        from opentelemetry.sdk.trace import TracerProvider  # type: ignore[import]
        from opentelemetry.sdk.trace.export import BatchSpanProcessor  # type: ignore[import]

        resource = Resource({"service.name": service_name})
        provider = TracerProvider(resource=resource)

        if endpoint:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (  # type: ignore[import]
                OTLPSpanExporter,
            )
            exporter = OTLPSpanExporter(endpoint=endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info("OTEL tracing enabled", endpoint=endpoint, service=service_name)
        else:
            logger.info("OTEL tracing set up without exporter (no OTEL_EXPORTER_OTLP_ENDPOINT)")

        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer(service_name)
    except ImportError:
        logger.warning("opentelemetry not installed — tracing disabled")


@contextlib.contextmanager
def span(name: str, attrs: dict[str, Any] | None = None) -> Generator[Any, None, None]:
    """Context manager that creates an OTEL span if tracing is configured, else is a no-op."""
    if _tracer is None:
        yield None
        return

    with _tracer.start_as_current_span(name) as s:
        if attrs:
            for k, v in attrs.items():
                s.set_attribute(k, str(v))
        yield s
