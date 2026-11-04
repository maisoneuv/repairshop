from django.contrib import admin

from .models import Appointment, AvailabilityWindow, Route


class AvailabilityWindowInline(admin.TabularInline):
    model = AvailabilityWindow
    extra = 0


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("reference_id", "tenant", "type", "status", "first_name", "last_name", "route", "created_at")
    list_filter = ("tenant", "type", "status")
    search_fields = ("reference_id", "first_name", "last_name", "phone_number")
    raw_id_fields = ("customer", "lead", "work_item", "source_call", "address", "route", "created_by")
    inlines = [AvailabilityWindowInline]


@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ("date", "tenant", "driver", "start_address", "end_address")
    raw_id_fields = ("start_address", "end_address")
    list_filter = ("tenant",)
