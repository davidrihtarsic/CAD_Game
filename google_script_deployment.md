GOOGLE SCRIPT DEPLOYMENT
================================================================================

DEPLOYMENT id
AKfycbxaC0U-xx5dTHflVMP1F2aJPU0YaGnBQZEM0iB7eYsjb6hIPLo5lQJlUoTfVXtiIMAbqg

Web app
[URL](https://script.google.com/macros/s/AKfycbxaC0U-xx5dTHflVMP1F2aJPU0YaGnBQZEM0iB7eYsjb6hIPLo5lQJlUoTfVXtiIMAbqg/exec")

> **Note:** all GET requests from the client now use JSONP (`callback` query param) to avoid CORS issues. The Apps Script backend supports JSONP via the `output_` helper; no special headers are needed. The **stats** endpoint previously returned plain JSON – it now always goes through `output_` so callbacks work correctly.
