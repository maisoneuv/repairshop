from django.contrib import admin

from core.admin_mixins import TenantAwareImportExportAdmin

from .models import CashRegister, CashTransaction, Employee, Location, RepairShop


@admin.register(RepairShop)
class RepairShopAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'tenant', 'type', 'active')
    list_filter = ('tenant', 'type', 'active')
    search_fields = ('name',)
    autocomplete_fields = ['tenant', 'address']


@admin.register(Location)
class LocationAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'tenant', 'type', 'shop', 'customer')
    list_filter = ('tenant', 'type')
    search_fields = ('name', 'customer__first_name', 'customer__last_name')
    autocomplete_fields = ['tenant', 'shop', 'customer', 'address']


@admin.register(Employee)
class EmployeeAdmin(TenantAwareImportExportAdmin):
    list_display = ('user', 'tenant', 'role', 'location')
    list_filter = ('tenant', 'role')
    search_fields = ('user__email', 'user__first_name', 'user__last_name')
    autocomplete_fields = ['tenant', 'user', 'location']


@admin.register(CashRegister)
class CashRegisterAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'shop', 'tenant', 'default_owner', 'opening_balance', 'is_active')
    list_filter = ('tenant', 'shop', 'is_active')
    search_fields = ('name', 'shop__name')
    autocomplete_fields = ['tenant', 'shop', 'default_owner']


@admin.register(CashTransaction)
class CashTransactionAdmin(TenantAwareImportExportAdmin):
    list_display = ('register', 'transaction_type', 'amount', 'currency', 'work_item', 'performed_by', 'created_at')
    list_filter = ('tenant', 'transaction_type', 'currency')
    search_fields = ('description', 'register__name')
    autocomplete_fields = ['tenant', 'register', 'work_item', 'performed_by']
    readonly_fields = ('created_at',)
