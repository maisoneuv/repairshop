from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    # work_item_detail,
    WorkItemDetailView,
    WorkItemUpdateView,
    WorkItemListView,
    WorkItemCreateView,
    TaskListView,
    TaskCreateView,
    TaskDetailView,
    TaskUpdateView,
    customer_search,
    device_search,
work_item_create,
WorkItemViewSet,
WorkItemSchemaView,
TaskSchemaView,
TaskViewSet,
TaskTypeViewSet)

app_name = "tasks"

router = DefaultRouter()
router.register(r'work-items', WorkItemViewSet, basename='workitem')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'task-types', TaskTypeViewSet, basename='tasktype')

urlpatterns = [
    path('item_list', WorkItemListView.as_view(), name="work_item_list"),
    path('create_item', work_item_create, name="work_item_create"),
    path('item/<pk>/update', WorkItemUpdateView.as_view(), name="work_item_update"),
    path('item/<pk>/', WorkItemDetailView.as_view(), name="work_item_detail"),
    path('task_list', TaskListView.as_view(), name="task_list"),
    path('task_detail/<pk>', TaskDetailView.as_view(), name="task_detail"),
    path('task_create', TaskCreateView.as_view(), name="task_create"),
    path('task_update/<pk>', TaskUpdateView.as_view(), name="task_update"),
    path('customer-search', customer_search, name="customer_search"),
    path('device-search', device_search, name="device_search"),
    path('api/schema/work-item/', WorkItemSchemaView.as_view(), name="work_item_schema"),
    path('api/schema/task/', TaskSchemaView.as_view(), name="task_schema"),
]

# Router URLs come first so they take precedence
urlpatterns = router.urls + urlpatterns