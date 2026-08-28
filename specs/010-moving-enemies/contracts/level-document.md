# Level document contract additions

```json
{
  "id": "slime-1",
  "type": "slime",
  "x": 640,
  "y": 592,
  "width": 48,
  "height": 32,
  "movement": { "axis": "horizontal", "distance": 192, "speed": 70 }
}
```

`bee` uses the same fields. Missing movement gets type-specific defaults. Unknown fields, invalid ranges, duplicate IDs, and out-of-bounds rectangles remain invalid.

Legacy compatibility is limited to `yandeu-slime-` and `yandeu-bee-` spike ID prefixes.

Fall death keeps the existing event shape:

```json
{ "type": "died", "objectId": "fall", "x": 1000, "y": 1200 }
```
