from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import auth_views

urlpatterns = [
    path('login/', auth_views.login_view, name='auth_login'),
    path('logout/', auth_views.logout_view, name='auth_logout'),
    path('check/', auth_views.auth_check, name='auth_check'),
    path('register/', auth_views.register_view, name='auth_register'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('users/', auth_views.users_view, name='users_view'),
    path('users/<int:user_id>/', auth_views.user_detail_view, name='user_detail'),
    path('password-request/', auth_views.forgot_password_request, name='forgot_password_request'),
    path('password-requests/', auth_views.admin_password_requests, name='admin_password_requests'),
    path('password-requests/<int:req_id>/respond/', auth_views.respond_password_request, name='respond_password_request'),
    path('notifications/', auth_views.notifications_view, name='notifications'),
    path('notifications/<int:notif_id>/', auth_views.delete_notification, name='delete_notification'),
    path('password-request-status/', auth_views.check_request_status, name='check_request_status'),
    path('password-reset-public/', auth_views.reset_password_public, name='reset_password_public'),
]
