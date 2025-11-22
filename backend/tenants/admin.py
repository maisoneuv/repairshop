from django.contrib import admin

from core.admin_mixins import TenantAwareImportExportAdmin

from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'subdomain', 'created_at')
    search_fields = ('name', 'subdomain')
