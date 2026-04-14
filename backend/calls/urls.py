from django.urls import path
from . import views

urlpatterns = [
    path('incoming/', views.incoming_call),
    path('debug/', views.debug_incoming_call),
    path('pending/', views.pending_calls),
    path('<int:pk>/handled/', views.mark_handled),
    path('<int:pk>/', views.update_call),
]
