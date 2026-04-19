from pathlib import Path

import boto3
from botocore.client import Config

from ..config import settings


def _client() -> boto3.client:
    protocol = "https" if settings.minio_use_ssl else "http"
    return boto3.client(
        "s3",
        endpoint_url=f"{protocol}://{settings.minio_endpoint}:{settings.minio_port}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


def download_object(key: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    _client().download_file(settings.minio_bucket, key, str(dest))


def upload_object(
    local_path: Path,
    key: str,
    content_type: str = "application/octet-stream",
) -> None:
    _client().upload_file(
        str(local_path),
        settings.minio_bucket,
        key,
        ExtraArgs={"ContentType": content_type},
    )


def generate_presigned_get(key: str, expires: int = 3600) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": key},
        ExpiresIn=expires,
    )
