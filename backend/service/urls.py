from django.urls import path

from service import views

app_name = "service"

urlpatterns = [
    path('api/employee/search/', views.EmployeeSearchView.as_view(), name="employee-api-search"),
    path('api/employee/me/', views.CurrentEmployeeView.as_view(), name="employee-api-current"),
]