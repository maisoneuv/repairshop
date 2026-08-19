from django.urls import path

from . import sync_views, views

urlpatterns = [
    path("auth/login", views.MobileLoginView.as_view(), name="mobile-login"),
    path("auth/refresh", views.MobileRefreshView.as_view(), name="mobile-refresh"),
    path("auth/logout", views.MobileLogoutView.as_view(), name="mobile-logout"),
    path("sync/customers", sync_views.sync_customers, name="mobile-sync-customers"),
]
