import os
import django
import json
from django.conf import settings
from django.test import RequestFactory

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'taxfiling.settings')
django.setup()

from maps.views import geojson_data
from django.contrib.auth.models import User

# Create a mock request
factory = RequestFactory()
user = User.objects.first()
request = factory.get('/api/geojson/')
request.user = user

# Call the view directly (bypassing the decorator's logic)
# Since @api_login_required is a custom decorator, we can just call it with a mock user.
# But actually, the decorator will still run and check for JWT.
# Let's import the view function without the decorator if possible, 
# or just mock the decorator.
from maps.views import geojson_data

# Mock the decorator check by setting request.user and ensuring authentication returns a result
request.user = user

# Some decorators store the original function in __wrapped__
view_func = getattr(geojson_data, '__wrapped__', geojson_data)

response = view_func(request)
print(f"Status Code: {response.status_code}")

if response.status_code == 200:
    data = json.loads(response.content)
    print(f"Success! Found {len(data['features'])} features.")
    # Check for any null geometries or weirdness
    for i, feature in enumerate(data['features']):
        if not feature['geometry']:
            print(f"Feature {i} has NULL geometry!")
        else:
            print(f"Feature {i}: {feature['properties'].get('ADM4_EN')} - {feature['properties'].get('color')}")
else:
    print(f"Error Content: {response.content}")
