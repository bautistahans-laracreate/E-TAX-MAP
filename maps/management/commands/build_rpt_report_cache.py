from django.core.management.base import BaseCommand
from maps.views import build_rpt_report_cache


class Command(BaseCommand):
    help = "Precompute and persist the RPT dashboard report cache."

    def handle(self, *args, **options):
        self.stdout.write("Building RPT report cache...")
        payload = build_rpt_report_cache()
        rows = payload.get('assessment_table', {}).get('rows', [])
        self.stdout.write(self.style.SUCCESS(f"Done. Barangays: {len(rows)}"))
