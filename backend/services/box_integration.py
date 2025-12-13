"""
Box integration service for OAuth and file operations.
Handles authentication, folder browsing, file downloads, and file moves.
"""
import os
import shutil
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

from boxsdk import OAuth2, Client
from boxsdk.exception import BoxAPIException
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import BoxConnection, BoxSyncLog, AuditLog


# OAuth state storage (in production, use Redis or database)
_oauth_states: dict[str, datetime] = {}


class BoxService:
    """Service for Box API operations."""

    def __init__(self, db: Session):
        self.db = db

    def get_connection(self) -> Optional[BoxConnection]:
        """Get the current Box connection (only one allowed)."""
        return self.db.query(BoxConnection).first()

    def get_oauth_url(self) -> dict:
        """Generate Box OAuth authorization URL."""
        if not settings.box_client_id or not settings.box_client_secret:
            raise ValueError("Box OAuth credentials not configured. Set BOX_CLIENT_ID and BOX_CLIENT_SECRET in .env")

        # Generate state token for CSRF protection
        state = secrets.token_urlsafe(32)
        _oauth_states[state] = datetime.utcnow()

        # Clean old states (older than 10 minutes)
        cutoff = datetime.utcnow() - timedelta(minutes=10)
        for s, t in list(_oauth_states.items()):
            if t < cutoff:
                del _oauth_states[s]

        # Build authorization URL
        params = {
            'client_id': settings.box_client_id,
            'redirect_uri': settings.box_redirect_uri,
            'response_type': 'code',
            'state': state,
        }
        auth_url = f"https://account.box.com/api/oauth2/authorize?{urlencode(params)}"

        return {
            'auth_url': auth_url,
            'state': state
        }

    def exchange_code(self, code: str, state: str) -> BoxConnection:
        """Exchange authorization code for tokens."""
        # Verify state
        if state not in _oauth_states:
            raise ValueError("Invalid or expired state token")
        del _oauth_states[state]

        # Create OAuth2 object and authenticate
        oauth = OAuth2(
            client_id=settings.box_client_id,
            client_secret=settings.box_client_secret,
        )

        # Exchange code for tokens
        access_token, refresh_token = oauth.authenticate(code)

        # Create Box client to get user info
        client = Client(oauth)
        user = client.user().get()

        # Get or create connection
        connection = self.get_connection()
        if not connection:
            connection = BoxConnection()
            self.db.add(connection)

        # Update connection with tokens and user info
        connection.access_token = access_token
        connection.refresh_token = refresh_token
        connection.token_expires_at = datetime.utcnow() + timedelta(hours=1)
        connection.box_user_id = user.id
        connection.box_user_name = user.name
        connection.box_user_email = user.login
        connection.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(connection)

        return connection

    def get_client(self, connection: Optional[BoxConnection] = None) -> Optional[Client]:
        """Get an authenticated Box client, refreshing tokens if needed."""
        if connection is None:
            connection = self.get_connection()

        if not connection or not connection.access_token:
            return None

        def store_tokens(access_token, refresh_token):
            """Callback to store refreshed tokens."""
            connection.access_token = access_token
            connection.refresh_token = refresh_token
            connection.token_expires_at = datetime.utcnow() + timedelta(hours=1)
            connection.updated_at = datetime.utcnow()
            self.db.commit()

        oauth = OAuth2(
            client_id=settings.box_client_id,
            client_secret=settings.box_client_secret,
            access_token=connection.access_token,
            refresh_token=connection.refresh_token,
            store_tokens=store_tokens
        )

        return Client(oauth)

    def list_folders(self, folder_id: str = '0', connection: Optional[BoxConnection] = None) -> list[dict]:
        """List folders in a Box folder."""
        client = self.get_client(connection)
        if not client:
            raise ValueError("No Box connection available")

        try:
            folder = client.folder(folder_id).get()
            items = folder.get_items(limit=100, offset=0)

            folders = []
            for item in items:
                if item.type == 'folder':
                    folders.append({
                        'id': item.id,
                        'name': item.name,
                        'type': 'folder'
                    })

            return folders
        except BoxAPIException as e:
            raise ValueError(f"Box API error: {e.message}")

    def list_files(self, folder_id: str, connection: Optional[BoxConnection] = None) -> list[dict]:
        """List CSV files in a Box folder."""
        client = self.get_client(connection)
        if not client:
            raise ValueError("No Box connection available")

        try:
            folder = client.folder(folder_id).get()
            # Request specific fields - mini items from get_items() don't have size/modified_at
            items = folder.get_items(limit=1000, offset=0, fields=['id', 'name', 'type', 'size', 'modified_at'])

            files = []
            for item in items:
                if item.type == 'file' and item.name.lower().endswith('.csv'):
                    files.append({
                        'id': item.id,
                        'name': item.name,
                        'size': getattr(item, 'size', None),
                        'modified_at': getattr(item, 'modified_at', None)
                    })

            return files
        except BoxAPIException as e:
            raise ValueError(f"Box API error: {e.message}")

    def download_file(self, file_id: str, local_path: Path, connection: Optional[BoxConnection] = None) -> Path:
        """Download a file from Box to local storage."""
        client = self.get_client(connection)
        if not client:
            raise ValueError("No Box connection available")

        try:
            box_file = client.file(file_id).get()
            with open(local_path, 'wb') as f:
                box_file.download_to(f)
            return local_path
        except BoxAPIException as e:
            raise ValueError(f"Box API error: {e.message}")

    def move_file(self, file_id: str, dest_folder_id: str, connection: Optional[BoxConnection] = None) -> dict:
        """Move a file to a different folder in Box."""
        client = self.get_client(connection)
        if not client:
            raise ValueError("No Box connection available")

        try:
            box_file = client.file(file_id)
            moved_file = box_file.move(parent_folder=client.folder(dest_folder_id))
            return {
                'id': moved_file.id,
                'name': moved_file.name,
                'parent_id': moved_file.parent.id
            }
        except BoxAPIException as e:
            raise ValueError(f"Box API error: {e.message}")

    def upload_file(
        self,
        file_path: Path,
        folder_id: str,
        filename: Optional[str] = None,
        connection: Optional[BoxConnection] = None
    ) -> dict:
        """Upload a file to a Box folder."""
        client = self.get_client(connection)
        if not client:
            raise ValueError("No Box connection available")

        try:
            folder = client.folder(folder_id)
            upload_filename = filename or file_path.name

            with open(file_path, 'rb') as f:
                uploaded_file = folder.upload_stream(f, upload_filename)

            return {
                'id': uploaded_file.id,
                'name': uploaded_file.name,
                'size': uploaded_file.size if hasattr(uploaded_file, 'size') else None
            }
        except BoxAPIException as e:
            raise ValueError(f"Box API error: {e.message}")

    def update_folder_config(
        self,
        staging_folder_id: str,
        staging_folder_name: str,
        processed_folder_id: str,
        processed_folder_name: str,
        sync_interval_minutes: int = 60,
        connection: Optional[BoxConnection] = None
    ) -> BoxConnection:
        """Update folder configuration for the Box connection."""
        if connection is None:
            connection = self.get_connection()

        if not connection:
            raise ValueError("No Box connection available")

        connection.staging_folder_id = staging_folder_id
        connection.staging_folder_name = staging_folder_name
        connection.processed_folder_id = processed_folder_id
        connection.processed_folder_name = processed_folder_name
        connection.sync_interval_minutes = sync_interval_minutes
        connection.is_active = True
        connection.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(connection)

        return connection

    def disconnect(self) -> bool:
        """Remove Box connection and clear tokens."""
        connection = self.get_connection()
        if connection:
            self.db.delete(connection)
            self.db.commit()
            return True
        return False

    def create_sync_log(self, connection_id: str) -> BoxSyncLog:
        """Create a new sync log entry."""
        log = BoxSyncLog(connection_id=connection_id)
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def update_sync_log(
        self,
        log: BoxSyncLog,
        status: str,
        files_found: int = 0,
        files_processed: int = 0,
        files_failed: int = 0,
        records_imported: int = 0,
        error_message: Optional[str] = None,
        details: Optional[dict] = None
    ):
        """Update a sync log entry."""
        log.status = status
        log.files_found = files_found
        log.files_processed = files_processed
        log.files_failed = files_failed
        log.records_imported = records_imported
        log.error_message = error_message
        log.details = details
        if status in ['success', 'error']:
            log.completed_at = datetime.utcnow()
        self.db.commit()

    def get_sync_logs(self, limit: int = 20) -> list[BoxSyncLog]:
        """Get recent sync logs."""
        return self.db.query(BoxSyncLog).order_by(BoxSyncLog.started_at.desc()).limit(limit).all()


def is_box_configured() -> bool:
    """Check if Box OAuth credentials are configured."""
    return bool(settings.box_client_id and settings.box_client_secret)
