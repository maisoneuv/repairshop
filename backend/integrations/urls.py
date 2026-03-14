"""
URL configuration for integrations app.
"""
from django.urls import path
from .views import SummaryCallbackView, CustomActionListView, CustomActionExecuteView

urlpatterns = [
    path('summary-callback/', SummaryCallbackView.as_view(), name='summary-callback'),
    path('custom-actions/', CustomActionListView.as_view(), name='custom-action-list'),
    path('custom-actions/<int:pk>/execute/', CustomActionExecuteView.as_view(), name='custom-action-execute'),
]
