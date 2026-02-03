#!/bin/bash

echo "🧪 Testing Import API Endpoints..."
echo ""

# Test AI Mapping Endpoint
echo "1️⃣ Testing /api/imports/ai-map endpoint..."
echo ""

RESPONSE=$(curl -s -X POST http://localhost:3001/api/imports/ai-map \
  -F "file=@test-data/budget-import-sample.csv")

echo "Response:"
echo "$RESPONSE" | jq '.'
echo ""

# Check if successful
if echo "$RESPONSE" | jq -e '.success == true' > /dev/null; then
  echo "✅ AI Mapping API: PASSED"

  # Extract mappings count
  MAPPINGS_COUNT=$(echo "$RESPONSE" | jq '.mappings | length')
  echo "   Detected $MAPPINGS_COUNT column mappings"

  # Show mapped fields
  echo "   Mapped fields:"
  echo "$RESPONSE" | jq -r '.mappings[] | "      \(.sourceColumn) → \(.targetField) (\(.confidence * 100 | floor)%)"'

else
  echo "❌ AI Mapping API: FAILED"
  echo "   Error: $(echo "$RESPONSE" | jq -r '.error')"
fi

echo ""
echo "🎉 Import API testing complete!"
