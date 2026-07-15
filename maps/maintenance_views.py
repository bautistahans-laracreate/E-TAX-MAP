import os
import shutil
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from maps.views import api_login_required

def get_static_base_dir():
    return os.path.join(settings.BASE_DIR, 'maps', 'static')

@csrf_exempt
@api_login_required
def maintenance_files(request):
    base_dir = get_static_base_dir()
    
    if request.method == 'GET':
        # Get path parameter (relative to maps/static/)
        rel_path = request.GET.get('path', '')
        
        # If root, just return CAD and PIM directories
        if not rel_path:
            return JsonResponse({
                'current_path': '',
                'directories': [
                    {'name': 'CAD', 'path': 'CAD', 'size': 0, 'is_dir': True},
                    {'name': 'PIM', 'path': 'PIM', 'size': 0, 'is_dir': True}
                ],
                'files': []
            })
        
        # Ensure the path is within CAD or PIM
        if not rel_path.startswith(('CAD', 'PIM')):
            return JsonResponse({'error': 'Invalid path. Must be strictly within CAD or PIM.'}, status=400)
            
        full_path = os.path.join(base_dir, rel_path)
        # Prevent directory traversal
        if not os.path.abspath(full_path).startswith(os.path.abspath(base_dir)):
            return JsonResponse({'error': 'Path traversal is not allowed.'}, status=400)
            
        if not os.path.exists(full_path) or not os.path.isdir(full_path):
            return JsonResponse({'error': 'Directory not found.'}, status=404)
            
        try:
            items = os.listdir(full_path)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
            
        directories = []
        files = []
        
        for item in items:
            item_path = os.path.join(full_path, item)
            is_dir = os.path.isdir(item_path)
            
            # For files, we typically expect .gpkg
            stat = os.stat(item_path)
            size = stat.st_size
            
            item_data = {
                'name': item,
                'path': os.path.join(rel_path, item).replace('\\', '/'),
                'size': size,
                'is_dir': is_dir,
            }
            
            if is_dir:
                directories.append(item_data)
            else:
                files.append(item_data)
                
        # Sort alphabetically
        directories.sort(key=lambda x: x['name'].lower())
        files.sort(key=lambda x: x['name'].lower())
        
        return JsonResponse({
            'current_path': rel_path,
            'directories': directories,
            'files': files
        })
        
    elif request.method == 'POST':
        # Process file upload
        rel_path = request.POST.get('path', '')
        
        if rel_path and not rel_path.startswith(('CAD', 'PIM')):
            return JsonResponse({'error': 'Invalid path. Must be strictly within CAD or PIM.'}, status=400)
            
        full_path = os.path.join(base_dir, rel_path)
        if not os.path.abspath(full_path).startswith(os.path.abspath(base_dir)):
            return JsonResponse({'error': 'Path traversal is not allowed.'}, status=400)
            
        if not os.path.exists(full_path) or not os.path.isdir(full_path):
            return JsonResponse({'error': 'Target directory not found.'}, status=404)
            
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return JsonResponse({'error': 'No file uploaded.'}, status=400)
            
        file_path = os.path.join(full_path, uploaded_file.name)
        
        try:
            with open(file_path, 'wb+') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            return JsonResponse({'message': 'File uploaded successfully.', 'file': uploaded_file.name})
        except Exception as e:
            return JsonResponse({'error': f'Failed to save file: {e}'}, status=500)
            
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
@api_login_required
@require_http_methods(["POST"]) # We use POST for deletion to easily pass JSON or formdata from frontend
def maintenance_delete_file(request):
    base_dir = get_static_base_dir()
    
    target_path = request.POST.get('filepath')
    
    if not target_path:
        return JsonResponse({'error': 'Filepath not provided.'}, status=400)
        
    if not target_path.startswith(('CAD', 'PIM')):
        return JsonResponse({'error': 'Invalid path. Must be within CAD or PIM.'}, status=400)
        
    full_path = os.path.join(base_dir, target_path)
    
    if not os.path.abspath(full_path).startswith(os.path.abspath(base_dir)):
        return JsonResponse({'error': 'Path traversal is not allowed.'}, status=400)
        
    if not os.path.exists(full_path):
        return JsonResponse({'error': 'File not found.'}, status=404)
        
    if os.path.isdir(full_path):
        return JsonResponse({'error': 'Cannot delete directories, only files.'}, status=400)
        
    try:
        os.remove(full_path)
        return JsonResponse({'message': 'File deleted successfully.'})
    except Exception as e:
        return JsonResponse({'error': f'Failed to delete file: {str(e)}'}, status=500)
