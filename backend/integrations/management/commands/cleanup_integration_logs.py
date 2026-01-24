"""
Management command to clean up old integration request logs.

Usage:
    python manage.py cleanup_integration_logs
    python manage.py cleanup_integration_logs --dry-run
    python manage.py cleanup_integration_logs --success-days=14 --failed-days=60
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from integrations.models import IntegrationRequestLog


class Command(BaseCommand):
    help = 'Clean up old integration request logs based on retention settings'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting'
        )
        parser.add_argument(
            '--success-days',
            type=int,
            default=30,
            help='Retention days for successful requests (default: 30)'
        )
        parser.add_argument(
            '--failed-days',
            type=int,
            default=90,
            help='Retention days for failed requests (default: 90)'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        success_days = options['success_days']
        failed_days = options['failed_days']

        now = timezone.now()
        success_cutoff = now - timedelta(days=success_days)
        failed_cutoff = now - timedelta(days=failed_days)

        self.stdout.write('Retention settings:')
        self.stdout.write(f'  Successful requests: {success_days} days (before {success_cutoff.date()})')
        self.stdout.write(f'  Failed requests: {failed_days} days (before {failed_cutoff.date()})')

        # Count logs to delete
        success_qs = IntegrationRequestLog.objects.filter(
            success=True,
            timestamp__lt=success_cutoff
        )
        success_count = success_qs.count()

        failed_qs = IntegrationRequestLog.objects.filter(
            success=False,
            timestamp__lt=failed_cutoff
        )
        failed_count = failed_qs.count()

        total = success_count + failed_count

        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY RUN] Would delete:'))
            self.stdout.write(f'  {success_count} successful request logs')
            self.stdout.write(f'  {failed_count} failed request logs')
            self.stdout.write(f'  {total} total')
        else:
            success_qs.delete()
            failed_qs.delete()
            self.stdout.write(self.style.SUCCESS('\nDeleted:'))
            self.stdout.write(f'  {success_count} successful request logs')
            self.stdout.write(f'  {failed_count} failed request logs')
            self.stdout.write(self.style.SUCCESS(f'  {total} total'))
