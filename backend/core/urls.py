from django.urls import path
from .views import *
from django.contrib.auth.views import LoginView
from rest_framework.routers import DefaultRouter

note_list = NoteViewSet.as_view({"get": "list", "post": "create"})

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'role-permissions', RolePermissionViewSet, basename='rolepermission')
router.register(r'user-roles', UserRoleViewSet, basename='userrole')

urlpatterns = router.urls

urlpatterns += [
    path('', home_view, name="home"),
    # path('login', LoginView.as_view(), name='login'),
    path("notes/<str:model>/<int:obj_id>/", note_list, name="note-list"),
    path('me/permissions/', MyPermissionsView.as_view(), name='my-permissions'),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),
]