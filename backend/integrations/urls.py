"""
URL configuration for integrations app.
"""
from django.urls import path
from .views import SummaryCallbackView

urlpatterns = [
    path('summary-callback/', SummaryCallbackView.as_view(), name='summary-callback'),
]
