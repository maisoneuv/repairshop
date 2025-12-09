"""
URL configuration for app project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularSwaggerView,
    SpectacularAPIView,
)
from core.views import react_app_view


urlpatterns = [
    path('admin/', admin.site.urls),
    # API routes - all under /api/ prefix
    path('api/core/', include('core.urls')),
    path('api/tasks/', include('tasks.urls'), name='tasks'),
    path('api/customers/', include('customers.urls'), name='customers'),
    path('api/inventory/', include('inventory.urls'), name='inventory'),
    path('api/service/', include('service.urls'), name='service'),
    path('api/documents/', include('documents.urls'), name='documents'),
    path('api/schema/', SpectacularAPIView.as_view(), name='api-schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='api-schema'), name='api-docs'),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Only serve React app via Django in local development
# In Docker, nginx handles all frontend routes
if settings.DEBUG and not getattr(settings, 'IN_DOCKER', False):
    urlpatterns += [
        # Serve React app for root
        path('', react_app_view, name='react-app-root'),

        # Catch-all pattern for React SPA client-side routes - MUST BE LAST
        # This catches any URL that doesn't match the API patterns above
        re_path(r'^(?!admin/|api/).*$', react_app_view, name='react-app'),
    ]
