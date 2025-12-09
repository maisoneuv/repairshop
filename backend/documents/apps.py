from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'documents'
    verbose_name = 'Form Documents'

    def ready(self):
        """Import signals when Django starts"""
        import documents.signals
