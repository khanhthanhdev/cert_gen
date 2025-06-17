# 🎓 Certificate Generator v2.0 - Clean & Organized

A modern, modular certificate generation application that creates personalized PDF certificates by merging participant data with PDF templates.

## 🚀 Quick Start (5 Minutes!)

### Step 1: Start the Server 🌐

**Important:** You need to start the server first to use the web tools:

```bash
# Start the coordinate picker server
npm run coordinate-picker

# The server will be available at http://localhost:3000
```

📖 **Need help?** See [START_SERVER.md](START_SERVER.md) for detailed instructions.

### **Step 2: Get Your Text Coordinates 📍

1. **Open http://localhost:3000/picker** (or click "Open Coordinate Picker" from the main dashboard)

2. **Upload your PDF template** (e.g., from `assets/templates/`)

3. **Draw lines where you want text to appear:**
   - Draw a line for NAME placement
   - Draw a line for POSITION placement
   - Click "Save Configuration" to auto-update `config.json`

### Step 3: Generate Certificates 🎯

```bash
npm start
```

That's it! Your certificates will be in the `output/participants/` folder.

## 📁 Project Structure

```
cert_gen/
├── 📂 assets/           # All project assets
│   ├── fonts/           # Font files
│   ├── templates/       # PDF templates  
│   └── sample-data/     # CSV data files
├── 📂 src/              # Clean, modular source code
│   ├── core/            # Core application logic
│   ├── services/        # Business logic
│   └── utils/           # Utility functions
├── 📂 tools/            # Development tools
├── 📂 docs/             # Documentation
├── 📄 config.json       # Main configuration
└── 📄 index.js          # Application entry point
```

## 🛠️ Available Commands

```bash
# Generate certificates
npm start
npm run generate

# Development tools  
npm run coordinate-picker    # Visual coordinate picker
npm run validate-config      # Validate configuration
npm run test-coordinates     # Test coordinate placement
npm run diagnose-positioning # Debug positioning issues
```## ⚙️ Configuration

All settings are in `config.json`:

- **Templates**: PDF files in `assets/templates/`
- **Fonts**: Font files in `assets/fonts/`
- **Data**: CSV files in `assets/sample-data/`
- **Output**: Generated certificates in `output/participants/`

### Execution Modes

```json
{
  "execution": {
    "mode": "test",  // or "csv"
    "csvFilePath": "./assets/sample-data/data.csv"
  }
}
```

- **test**: Uses built-in sample data for quick testing
- **csv**: Processes data from specified CSV file

### Text Positioning

```json
{
  "textFields": {
    "name": {
      "coordinates": {
        "lineStartX": 343.5,
        "lineEndX": 714.5,
        "yFromTop": 294.59375,
        "coordinateSystem": "line"
      }
    }
  }
}
```

## 🎨 Visual Tools

### Line Coordinate Picker (Recommended)
```bash
npm run coordinate-picker
# Open http://localhost:3000/tools/lineCoordinatePicker.html
```
- Draw lines on your PDF template
- Auto-saves coordinates to config.json
- Perfect text alignment and centering

### Click Coordinate Picker
- Open `tools/test_coordinates.html` in browser
- Click to get exact coordinates
- Manual config.json editing required

## 🔧 Development Tools

### Validate Configuration
```bash
npm run validate-config
```

### Test Coordinates
```bash
npm run test-coordinates
```

### Diagnose Positioning Issues
```bash
npm run diagnose-positioning
```

## 📚 Documentation

- **PROJECT_STRUCTURE.md**: Detailed project organization
- **docs/CONFIG_GUIDE.md**: Complete configuration reference
- **docs/LINE_PICKER_GUIDE.md**: Line picker usage guide

## 🔄 Migration from Legacy

If upgrading from the original version:
1. Assets moved to `assets/` directory
2. Code reorganized into modular structure
3. New scripts in package.json
4. Legacy files preserved in `legacy/` folder

## 💡 Features

- ✅ **Clean, modular codebase**
- ✅ **Visual coordinate picking tools**
- ✅ **Automatic text centering and scaling**
- ✅ **CSV data processing**
- ✅ **UTF-8 support for international names**
- ✅ **Configurable fonts and colors**
- ✅ **Error handling and validation**
- ✅ **Progress tracking**

## 🤝 Contributing

1. Code is organized in `src/` with clear separation
2. Tools for development are in `tools/`
3. Configuration is centralized in `config.json`
4. Documentation is in `docs/`

The modular structure makes it easy to:
- Add new text fields
- Support new coordinate systems
- Extend with new file formats
- Add new visual tools
  "csvFilePath": "./data.csv"
}
```

### Step 4: Run It! 🚀

```bash
node TTT_TNV.mjs
```

**That's it!** Your certificates will be generated in the `output/participants` folder.

---

## 🔧 Fine-Tuning (Optional)

### Font Sizes
```json
"fonts": {
  "primary": { "size": 50 },    // Name font size
  "secondary": { "size": 25 }   // Position font size
}
```

### Colors (RGB values 0.0 to 1.0)
```json
"color": { "r": 0.13, "g": 0.18, "b": 0.4 }  // Dark blue
"color": { "r": 0.0, "g": 0.0, "b": 0.0 }    // Black
"color": { "r": 1.0, "g": 0.0, "b": 0.0 }    // Red
```

### CSV Column Mapping
If your CSV has different columns:
```json
"csvMapping": {
  "nameColumn": 1,      // Name is in column 2 (0-based indexing)
  "positionColumn": 5   // Position is in column 6
}
```

---

## 🛠️ Troubleshooting

### "Text appears in wrong place"
1. Use `test_coordinates.html` to get new coordinates
2. Update `centerX` and `centerY` in config.json
3. Test again with `"mode": "test"`

### "Font not found"
Check that font files exist:
- `./MonteCarlo/MonteCarlo-Regular.ttf`
- `./Quicksand/static/Quicksand-Bold.ttf`

### "CSV not working"
1. Check your `csvFilePath` in config.json
2. Verify `nameColumn` and `positionColumn` numbers
3. Make sure CSV has headers if `skipFirstRow: true`

---

## 📁 File Structure

```
cert_gen/
├── config.json          ⬅️ Main configuration (edit this!)
├── TTT_TNV.mjs          ⬅️ Main generator (don't edit)
├── test_coordinates.html ⬅️ Coordinate picker tool
├── data.csv             ⬅️ Your participant data
├── ttt_tnv.pdf         ⬅️ Your certificate template
└── output/
    └── participants/    ⬅️ Generated certificates appear here
```

---

## 💡 Pro Tips

1. **Always test first**: Use `"mode": "test"` before processing large CSV files
2. **Check coordinates**: Run `node testCoordinates.js` to see exactly where text will appear
3. **Backup configs**: Save working configurations before making changes
4. **Validate setup**: Run `node validateConfig.js` to check everything is set up correctly

---

## 🎨 Advanced Features

### Multiple Templates
Create different config files for different certificate templates:
```bash
node TTT_TNV.mjs ./config-graduation.json
node TTT_TNV.mjs ./config-participation.json
```

### Custom Test Data
Add your own test participants in config.json:
```json
"testData": [
  { "name": "John Doe", "position": "Student" },
  { "name": "Jane Smith", "position": "Teacher" }
]
```

### Processing Options
```json
"processing": {
  "showWarnings": true,     // Show text overflow warnings
  "showProgress": true,     // Show generation progress
  "validateInput": true     // Validate CSV data
}
```

---

## ❓ Need Help?

1. **Check the console**: Error messages will guide you
2. **Validate config**: Run `node validateConfig.js`
3. **Test coordinates**: Use `test_coordinates.html` or `node testCoordinates.js`
4. **Read the full guide**: See `CONFIG_GUIDE.md` for detailed explanations

---

**Happy Certificate Generating! 🎉**
