from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    WorkItemViewSet,
    WorkItemSchemaView,
    TaskSchemaView,
    TaskViewSet,
    TaskTypeViewSet,
    DashboardView,
)
from .process_views import AllWorkItemsView, MyWorkView, NotificationViewSet

app_name = "tasks"

router = DefaultRouter()
router.register(r'work-items', WorkItemViewSet, basename='workitem')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'task-types', TaskTypeViewSet, basename='tasktype')
# Guided process (flag-gated — 404s unless workitem.guided_process is on).
router.register(r'notifications', NotificationViewSet, basename='notification')

# Legacy Django template routes (item_list, task_list, …) were removed:
# unscoped by tenant and unused by the React frontend.
urlpatterns = [
    path('api/schema/work-item/', WorkItemSchemaView.as_view(), name="work_item_schema"),
    path('api/schema/task/', TaskSchemaView.as_view(), name="task_schema"),
    path('dashboard/', DashboardView.as_view(), name="dashboard"),
    # Guided-process queues (§7E)
    path('my-work/', MyWorkView.as_view(), name="my_work"),
    path('all-work-items/', AllWorkItemsView.as_view(), name="all_work_items"),
]

# Router URLs come first so they take precedence
urlpatterns = router.urls + urlpatterns
