import json
import uuid
from typing import Optional, cast
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.core.mail import send_mail
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework_simplejwt.tokens import RefreshToken
from .models import PasswordRequest, Notification

DEFAULT_SHARED_ADMIN_EMAIL = 'lgusanpascual.sysadmin@gmail.com'
DEFAULT_SHARED_ADMIN_PASSWORD = 'lgusp123'
DEFAULT_SHARED_ADMIN_FIRST_NAME = 'LGU San Pascual'
DEFAULT_SHARED_ADMIN_LAST_NAME = 'System Admin'


def _get_tokens_for_user(user):
    """Generate JWT access + refresh pair for a user."""
    refresh = RefreshToken.for_user(user)
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


def _get_user_from_request(request) -> Optional[User]:
    """Extract user from JWT-authenticated DRF request (or None)."""
    from rest_framework_simplejwt.authentication import JWTAuthentication
    try:
        auth = JWTAuthentication()
        result = auth.authenticate(request)
        if result:
            return result[0]
    except Exception:
        pass
    return None


def _find_admin_user(identifier: str) -> Optional[User]:
    identifier = (identifier or '').strip()
    if not identifier:
        return None
    return User.objects.filter(is_staff=True).filter(
        username=identifier
    ).first() or User.objects.filter(is_staff=True, email__iexact=identifier).first()


def _ensure_default_shared_admin() -> User:
    """
    Ensure the thesis demo admin exists on any local database automatically.
    This lets pulled code work across laptops even when each machine has its own DB.
    """
    user = (
        User.objects.filter(email__iexact=DEFAULT_SHARED_ADMIN_EMAIL).first()
        or User.objects.filter(username=DEFAULT_SHARED_ADMIN_EMAIL).first()
    )
    if user is None:
        user = User.objects.create_user(
            username=DEFAULT_SHARED_ADMIN_EMAIL,
            email=DEFAULT_SHARED_ADMIN_EMAIL,
            password=DEFAULT_SHARED_ADMIN_PASSWORD,
        )

    user.username = DEFAULT_SHARED_ADMIN_EMAIL
    user.email = DEFAULT_SHARED_ADMIN_EMAIL
    user.first_name = DEFAULT_SHARED_ADMIN_FIRST_NAME
    user.last_name = DEFAULT_SHARED_ADMIN_LAST_NAME
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.set_password(DEFAULT_SHARED_ADMIN_PASSWORD)
    user.save()
    return user


@require_http_methods(["GET"])
def auth_check(request):
    user = _get_user_from_request(request)
    if user and user.is_authenticated:
        return JsonResponse({
            'authenticated': True,
            'username': user.username,
            'full_name': f"{user.first_name} {user.last_name}".strip() or user.username,
            'is_staff': user.is_staff,
        })
    return JsonResponse({'authenticated': False, 'username': None, 'full_name': None, 'is_staff': False})


@csrf_exempt
@require_http_methods(["POST"])
def login_view(request):
    try:
        body = json.loads(request.body)
        role = body.get('role', 'admin')
        password = body.get('password', '').strip()
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    if not password:
        return JsonResponse({'error': 'Password is required.'}, status=400)

    if role == 'admin':
        identifier = body.get('identifier', body.get('email', body.get('id_number', ''))).strip()
        if not identifier:
            return JsonResponse({'error': 'Admin email or ID is required.'}, status=400)
        if identifier.lower() == DEFAULT_SHARED_ADMIN_EMAIL.lower():
            _ensure_default_shared_admin()
        admin_user = _find_admin_user(identifier)
        user = authenticate(request, username=admin_user.username, password=password) if admin_user else None
    else:
        email = body.get('email', '').strip()
        if not email:
            return JsonResponse({'error': 'Email address is required.'}, status=400)
        try:
            user_obj = User.objects.get(email=email)
            user = authenticate(request, username=user_obj.username, password=password)
        except User.DoesNotExist:
            user = None
        except User.MultipleObjectsReturned:
            return JsonResponse({'error': 'Multiple accounts found with this email.'}, status=400)

    if user is None:
        return JsonResponse({'error': 'Invalid credentials. Please try again.'}, status=401)

    # SECURE: Ensure regular users cannot login as admin
    if role == 'admin' and not user.is_staff:
        return JsonResponse({'error': 'Access denied: Regular users cannot login as Admin.'}, status=403)

    tokens = _get_tokens_for_user(user)
    return JsonResponse({
        'authenticated': True,
        'username': user.username,
        'full_name': f"{user.first_name} {user.last_name}".strip() or user.username,
        'is_staff': user.is_staff,
        **tokens,
    })


@csrf_exempt
@require_http_methods(["POST"])
def logout_view(request):
    """Blacklist the refresh token so it can't be reused."""
    try:
        body = json.loads(request.body)
        refresh_token = body.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
    except Exception:
        pass  # If blacklisting fails, the frontend already discards tokens
    return JsonResponse({'authenticated': False})


@csrf_exempt
@require_http_methods(["POST"])
def register_view(request):
    try:
        body = json.loads(request.body)
        role = body.get('role', 'user')
        password = body.get('password', '').strip()
        confirm_password = body.get('confirm_password', '').strip()
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    if not password:
        return JsonResponse({'error': 'Password is required.'}, status=400)
    if password != confirm_password:
        return JsonResponse({'error': 'Passwords do not match.'}, status=400)
    if len(password) < 6:
        return JsonResponse({'error': 'Password must be at least 6 characters.'}, status=400)

    if role == 'admin':
        id_number = body.get('id_number', '').strip()
        name = body.get('name', '').strip()
        email = body.get('email', '').strip()

        if not id_number:
            return JsonResponse({'error': 'ID Number is required.'}, status=400)
        if not id_number.isdigit():
            return JsonResponse({'error': 'ID Number must be numeric.'}, status=400)
        if not name:
            return JsonResponse({'error': 'Name is required.'}, status=400)
        if not email:
            return JsonResponse({'error': 'Email address is required.'}, status=400)
        if User.objects.filter(username=id_number).exists():
            return JsonResponse({'error': 'An account with this ID Number already exists.'}, status=400)

        user = User.objects.create_user(username=id_number, email=email, password=password)
        user.is_staff = True
        parts = name.strip().split(' ', 1)
        user.first_name = parts[0]
        if len(parts) > 1:
            user.last_name = parts[1]
        user.save()
    else:
        email = body.get('email', '').strip()
        if not email:
            return JsonResponse({'error': 'Email address is required.'}, status=400)
        if User.objects.filter(email=email).exists():
            return JsonResponse({'error': 'An account with this email already exists.'}, status=400)

        username = email
        if User.objects.filter(username=username).exists():
            username = email.split('@')[0] + '_' + str(uuid.uuid4()).split('-')[0]

        user = User.objects.create_user(username=username, email=email, password=password)
        name = body.get('name', '').strip()
        if name:
            parts = name.split(' ', 1)
            user.first_name = parts[0]
            if len(parts) > 1:
                user.last_name = parts[1]
            user.save()

    tokens = _get_tokens_for_user(user)
    return JsonResponse({
        'authenticated': True,
        'username': user.username,
        'full_name': f"{user.first_name} {user.last_name}".strip() or user.username,
        'is_staff': user.is_staff,
        **tokens,
    })


# ── Admin: User management ─────────────────────────────────────────────────

def _user_to_dict(u):
    return {
        'id': u.id,
        'username': u.username,
        'full_name': f"{u.first_name} {u.last_name}".strip() or u.username,
        'role': 'Admin' if u.is_staff else 'Citizen',
        'email': u.email,
        'is_active': u.is_active,
    }


@csrf_exempt
@require_http_methods(["GET", "POST"])
def users_view(request):
    """Admin only: list users (GET) or create a user (POST, no auto-login)."""
    user = _get_user_from_request(request)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Authentication required.'}, status=401)
    
    user = cast(User, user)
    if not user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)

    if request.method == 'GET':
        users = [_user_to_dict(u) for u in User.objects.all().order_by('date_joined')]
        return JsonResponse({'users': users})

    # POST — create user without logging them in
    try:
        body = json.loads(request.body)
        role = body.get('role', 'citizen')
        password = body.get('password', '').strip()
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    if not password or len(password) < 6:
        return JsonResponse({'error': 'Password must be at least 6 characters.'}, status=400)

    if role == 'admin':
        id_number = body.get('id_number', '').strip()
        name = body.get('name', '').strip()
        email = body.get('email', '').strip()

        if not id_number:
            return JsonResponse({'error': 'ID Number is required.'}, status=400)
        if not id_number.isdigit():
            return JsonResponse({'error': 'ID Number must be numeric.'}, status=400)
        if User.objects.filter(username=id_number).exists():
            return JsonResponse({'error': 'ID Number already in use.'}, status=400)

        new_user = User.objects.create_user(username=id_number, email=email, password=password)
        new_user.is_staff = True
        if name:
            parts = name.split(' ', 1)
            new_user.first_name = parts[0]
            if len(parts) > 1:
                new_user.last_name = parts[1]
        new_user.save()
    else:
        email = body.get('email', '').strip()
        name  = body.get('name', '').strip()
        if not email:
            return JsonResponse({'error': 'Email is required.'}, status=400)
        if User.objects.filter(email=email).exists():
            return JsonResponse({'error': 'Email already in use.'}, status=400)

        username = email.split('@')[0]
        if User.objects.filter(username=username).exists():
            username = email.split('@')[0] + '_' + str(uuid.uuid4()).split('-')[0]

        new_user = User.objects.create_user(username=username, email=email, password=password)
        if name:
            parts = name.split(' ', 1)
            new_user.first_name = parts[0]
            if len(parts) > 1:
                new_user.last_name = parts[1]
            new_user.save()

    return JsonResponse({'success': True, 'user': _user_to_dict(new_user)}, status=201)


@csrf_exempt
@require_http_methods(["DELETE", "PATCH"])
def user_detail_view(request, user_id):
    """Admin only: GET (details), DELETE, or PATCH (update) a user by ID."""
    user = _get_user_from_request(request)
    if user is None or not user.is_authenticated:
        return JsonResponse({'error': 'Authentication required.'}, status=401)
    
    user = cast(User, user)
    if not user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)

    try:
        target = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'error': 'User not found.'}, status=404)

    if request.method == 'DELETE':
        if target == user:
            return JsonResponse({'error': 'Cannot delete your own account.'}, status=400)
        target.delete()
        return JsonResponse({'success': True})

    elif request.method == 'PATCH':
        try:
            body = json.loads(request.body)
            # Update fields if provided
            name = body.get('name')
            email = body.get('email')
            password = body.get('password')
            role = body.get('role')
            is_active = body.get('is_active')

            if name:
                parts = name.strip().split(' ', 1)
                target.first_name = parts[0]
                target.last_name = parts[1] if len(parts) > 1 else ""
            
            if email:
                if User.objects.filter(email=email).exclude(id=target.id).exists():
                    return JsonResponse({'error': 'Email already in use.'}, status=400)
                target.email = email
            
            if password:
                if len(password) < 6:
                    return JsonResponse({'error': 'Password must be at least 6 characters.'}, status=400)
                target.set_password(password)
                Notification.objects.create(
                    recipient=target,
                    title="Security Update",
                    message="Your account password was updated by an administrator."
                )
            
            if role:
                target.is_staff = (role.lower() == 'admin')
            
            if is_active is not None:
                target.is_active = bool(is_active)
            
            target.save()
            return JsonResponse({'success': True, 'user': _user_to_dict(target)})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

# ── Password Resets & Notifications ────────────────────────────────────────

@csrf_exempt
@require_http_methods(["POST"])
def forgot_password_request(request):
    """Public: submit a password help request."""
    try:
        body = json.loads(request.body)
        role = body.get('role', 'user')
        message = body.get('message', '')

        if role == 'admin':
            identifier = body.get('identifier', body.get('email', body.get('id_number', ''))).strip()
            user = _find_admin_user(identifier)
        else:
            email = body.get('email', '').strip()
            user = User.objects.filter(email=email).first()

        if user is None:
            return JsonResponse({'error': 'No account found with those details.'}, status=404)

        # Create or update existing pending request
        req, created = PasswordRequest.objects.update_or_create(
            user=user,
            status='pending',
            defaults={
                'request_type': 'reset',
                'message': message,
            }
        )

        # Notify other admins (excluding requester)
        user = cast(User, user)
        admins = User.objects.filter(is_staff=True).exclude(id=user.id)
        requester_display_name = f"{user.first_name} {user.last_name}".strip() or user.username
        requester_label = f"Admin {requester_display_name}" if user.is_staff else requester_display_name
        for admin in admins:
            Notification.objects.create(
                recipient=admin,
                title="New Password Request",
                message=f"{requester_label} ({user.username}) requested password assistance."
            )

        return JsonResponse({'success': True, 'message': 'Request submitted. Please check back later.'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
@require_http_methods(["GET"])
def admin_password_requests(request):
    """Admin only: list all pending requests."""
    user = _get_user_from_request(request)
    if not user or not user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)

    reqs = []
    for r in PasswordRequest.objects.all().order_by('-created_at'):
        reqs.append({
            'id': r.id,
            'user_id': r.user.id,
            'username': r.user.username,
            'full_name': f"{r.user.first_name} {r.user.last_name}".strip(),
            'role': 'Admin' if r.user.is_staff else 'Citizen',
            'status': r.status,
            'message': r.message,
            'created_at': r.created_at.isoformat(),
        })
    return JsonResponse({'requests': reqs})



@csrf_exempt
@require_http_methods(["POST"])
def respond_password_request(request, req_id):
    """Admin only: approve/deny request and send notification."""
    user = _get_user_from_request(request)
    if user is None or not user.is_staff:
        return JsonResponse({'error': 'Admin access required.'}, status=403)
    user = cast(User, user)

    try:
        req = PasswordRequest.objects.get(id=req_id)
        body = json.loads(request.body)
        action = body.get('action') # 'approve', 'deny', 'message'
        response_msg = body.get('message', '')

        responder_display_name = f"{user.first_name} {user.last_name}".strip() or user.username
        requester_display_name = f"{req.user.first_name} {req.user.last_name}".strip() or req.user.username

        if action == 'approve':
            req.status = 'approved'
            title = "Password Reset Approved"
            user_msg = "Admin has approved your password reset request."
            admin_action_word = "approved"
        elif action == 'deny':
            req.status = 'denied'
            title = "Password Request Denied"
            user_msg = "Your request was denied by Admin."
            admin_action_word = "denied"
        else: # just a message
            title = "Update on Password Request"
            user_msg = f"Admin: {response_msg}"
            admin_action_word = "responded to"

        # 1. Notify Requester (Anonymous "Admin")
        # Added back so they see the result in their bell once the task is done
        Notification.objects.create(
            recipient=req.user,
            title=title,
            message=user_msg
        )

        # 2. Notify Other Admins (Excluding responder and the requester themselves)
        other_admins = User.objects.filter(is_staff=True).exclude(id=user.id).exclude(id=req.user.id)
        requester_label = f"Admin {requester_display_name}" if req.user.is_staff else requester_display_name
        for admin in other_admins:
            Notification.objects.create(
                recipient=admin,
                title=f"Admin Response: {req.status.capitalize()}",
                message=f"Admin {responder_display_name} {admin_action_word} {requester_label}'s request."
            )
        
        req.admin_response = response_msg
        req.save()

        # Send Email notification
        subject = f"E-TaxMap: Password Request {req.status.capitalize()}"
        email_body = (
            f"Hello {req.user.first_name or req.user.username},\n\n"
            f"An administrator has responded to your password help request.\n\n"
            f"Status: {req.status.upper()}\n"
            f"Admin Response: {response_msg}\n\n"
            f"--- How to Reset Your Password ---\n"
            f"1. Go to the E-TaxMap Login Screen.\n"
            f"2. Click 'Forgot Password?' or 'Need account help?'.\n"
            f"3. Enter your account email or admin ID to check your status.\n"
            f"4. Once approved, the 'Reset Password' form will appear. Enter your new password and click 'Reset'.\n\n"
            f"Regards,\n"
            f"San Pascual E-TaxMap Team"
        )
        
        try:
            send_mail(
                subject,
                email_body,
                'no-reply@sanpascual-etaxmap.gov',
                [req.user.email],
                fail_silently=False,
            )
        except Exception as mail_err:
            print(f"Error sending email: {mail_err}")

        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
@require_http_methods(["GET", "POST", "DELETE"])
def notifications_view(request):
    """Authenticated users: see own notifications, mark as read, or clear all."""
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required.'}, status=401)

    if request.method == 'GET':
        notes = []
        for n in Notification.objects.filter(recipient=user).order_by('-created_at'):
            notes.append({
                'id': n.id,
                'title': n.title,
                'message': n.message,
                'is_read': n.is_read,
                'created_at': n.created_at.isoformat(),
            })
        return JsonResponse({'notifications': notes})
    
    elif request.method == 'POST':
        # mark all as read
        Notification.objects.filter(recipient=user).update(is_read=True)
        return JsonResponse({'success': True})
    
    elif request.method == 'DELETE':
        # clear all history
        Notification.objects.filter(recipient=user).delete()
        return JsonResponse({'success': True})


@csrf_exempt
@require_http_methods(["DELETE"])
def delete_notification(request, notif_id):
    """Authenticated users: delete a single notification."""
    user = _get_user_from_request(request)
    if not user:
        return JsonResponse({'error': 'Authentication required.'}, status=401)

    try:
        notif = Notification.objects.get(id=notif_id, recipient=user)
        notif.delete()
        return JsonResponse({'success': True})
    except Notification.DoesNotExist:
        return JsonResponse({'error': 'Notification not found.'}, status=404)
@csrf_exempt
@require_http_methods(["POST"])
def check_request_status(request):
    """Public: check status of a previously submitted request."""
    try:
        body = json.loads(request.body)
        role = body.get('role', 'user')
        
        if role == 'admin':
            identifier = body.get('identifier', body.get('email', body.get('id_number', ''))).strip()
            user = _find_admin_user(identifier)
        else:
            email = body.get('email', '').strip()
            user = User.objects.filter(email=email).first()

        if not user:
            return JsonResponse({'error': 'No account found.'}, status=404)

        # Get the latest request
        latest_req = PasswordRequest.objects.filter(user=user).order_by('-created_at').first()
        if not latest_req:
            return JsonResponse({'error': 'No help request found for this account.'}, status=404)

        msg = latest_req.admin_response
        if not msg:
            if latest_req.status == 'approved':
                msg = "The admin has approved of your request. You can now set your new password below."
            elif latest_req.status == 'denied':
                msg = "Your request was denied by an administrator."
            else:
                msg = "Your request is currently being reviewed by an administrator."

        return JsonResponse({
            'status': latest_req.status,
            'message': msg,
            'created_at': latest_req.created_at.isoformat(),
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

@csrf_exempt
@require_http_methods(["POST"])
def reset_password_public(request):
    """Public: Allow setting new password ONLY IF an approved request exists."""
    try:
        body = json.loads(request.body)
        role = body.get('role', 'user')
        new_password = body.get('new_password')
        
        if role == 'admin':
            identifier = body.get('identifier', body.get('email', body.get('id_number', ''))).strip()
            user = _find_admin_user(identifier)
        else:
            email = body.get('email', '').strip()
            user = User.objects.filter(email=email).first()

        if not user or not new_password:
            return JsonResponse({'error': 'Invalid request data.'}, status=400)

        # Check for latest approved request
        latest_req = PasswordRequest.objects.filter(user=user, status='approved').order_by('-created_at').first()
        if not latest_req:
            return JsonResponse({'error': 'You do not have an approved reset request.'}, status=403)

        # Update password
        user.set_password(new_password)
        user.save()

        Notification.objects.create(
            recipient=user,
            title="Password Reset Successful",
            message="Your password has been reset successfully."
        )

        # Mark request as resolved/completed (using a custom status or just updating updated_at)
        # For now we'll mark it as 'completed' so it's not reused for another reset
        latest_req.status = 'completed'
        latest_req.admin_response = "Password reset successfully by user."
        latest_req.save()

        return JsonResponse({'message': 'Password has been reset successfully. You can now log in.'})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)
