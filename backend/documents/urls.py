"""
URL configuration for documents API.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    FormTemplateViewSet,
    FormDocumentViewSet,
    WorkItemFormDocumentViewSet,
)

# Main router for templates and documents
router = DefaultRouter()
router.register(r'templates', FormTemplateViewSet, basename='formtemplate')
router.register(r'documents', FormDocumentViewSet, basename='formdocument')

app_name = 'documents'

urlpatterns = [
    path('', include(router.urls)),

    # Work item document endpoints (nested under work items)
    path('work-items/<int:work_item_pk>/documents/',
         WorkItemFormDocumentViewSet.as_view({'get': 'list', 'post': 'create'}),
         name='work-item-documents'),
]
