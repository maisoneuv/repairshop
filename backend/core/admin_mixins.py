from import_export import resources
from import_export.admin import ImportExportMixin, ImportExportModelAdmin


class TenantBoundModelResource(resources.ModelResource):
    """ModelResource that can access the current request/tenant context."""

    def __init__(self, *args, request=None, **kwargs):
        self.request = request
        super().__init__()

    def before_import_row(self, row, **kwargs):
        """Populate tenant column automatically when missing in import files."""
        request = self.request
        tenant = getattr(request, "tenant", None) if request else None
        if tenant and "tenant" in self.fields and not row.get("tenant"):
            row["tenant"] = tenant.pk
        return super().before_import_row(row, **kwargs)


class TenantAwareImportExportMixin(ImportExportMixin):
    """Adds import/export actions with automatic resource wiring."""

    resource_class = None
    _generated_resource_class = None

    def get_resource_class(self):
        if self.resource_class:
            return self.resource_class
        if self._generated_resource_class is None:
            meta = type(
                "Meta",
                (),
                {
                    "model": self.model,
                    "skip_unchanged": True,
                    "report_skipped": True,
                },
            )
            self._generated_resource_class = type(
                f"{self.model.__name__}Resource",
                (TenantBoundModelResource,),
                {"Meta": meta},
            )
        return self._generated_resource_class

    def get_import_resource_kwargs(self, request, *args, **kwargs):
        data = super().get_import_resource_kwargs(request, *args, **kwargs)
        data["request"] = request
        return data

    def get_export_resource_kwargs(self, request, *args, **kwargs):
        data = super().get_export_resource_kwargs(request, *args, **kwargs)
        data["request"] = request
        return data


class TenantAwareImportExportAdmin(TenantAwareImportExportMixin, ImportExportModelAdmin):
    """Concrete admin class to use import/export for standard model admins."""

    pass
