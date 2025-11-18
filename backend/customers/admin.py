from django.contrib import admin

from core.admin_mixins import TenantAwareImportExportAdmin

from .models import Asset, Customer, Lead, Opportunity


@admin.register(Customer)
class CustomerAdmin(TenantAwareImportExportAdmin):
    list_display = ('full_name', 'email', 'phone_number', 'tenant', 'referral_source')
    search_fields = ('first_name', 'last_name', 'email', 'phone_number')
    list_filter = ('tenant', 'referral_source')
    autocomplete_fields = ['tenant', 'address']


@admin.register(Lead)
class LeadAdmin(TenantAwareImportExportAdmin):
    list_display = ('full_name', 'email', 'phone_number')
    search_fields = ('first_name', 'last_name', 'email', 'phone_number')


@admin.register(Opportunity)
class OpportunityAdmin(TenantAwareImportExportAdmin):
    list_display = ('description', 'lead', 'customer')
    search_fields = ('description', 'lead__first_name', 'lead__last_name', 'customer__first_name', 'customer__last_name')
    autocomplete_fields = ['lead', 'customer']


@admin.register(Asset)
class AssetAdmin(TenantAwareImportExportAdmin):
    list_display = ('serial_number', 'customer', 'device')
    search_fields = ('serial_number', 'customer__first_name', 'customer__last_name', 'device__model')
    autocomplete_fields = ['customer', 'device']
