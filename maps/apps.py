from django.apps import AppConfig
import os
import sys


class MapsConfig(AppConfig):
    name = 'maps'

    def ready(self):
        # Auto-build the RPT report cache on server start (runserver only).
        if 'runserver' not in sys.argv:
            return
        if os.environ.get('RUN_MAIN') != 'true':
            return
        try:
            from .views import build_rpt_report_cache, _RPT_REPORT_CACHE_FILE
            if os.path.exists(_RPT_REPORT_CACHE_FILE):
                return
            build_rpt_report_cache()
        except Exception:
            # Fail silently to avoid breaking startup
            pass
