import numpy as np
import cv2
from PIL import Image, ImageTk
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os

class ImageDenoisingGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Non-Local Means Denoising Tool")
        self.root.geometry("1200x700")
        self.root.configure(bg='#2b2b2b')
        
        self.original_image = None
        self.denoised_image = None
        self.current_file_path = None
        
        self.setup_ui()
        
    def setup_ui(self):
        # Title
        title_label = tk.Label(
            self.root, 
            text="Image Denoising Tool", 
            font=("Arial", 24, "bold"),
            bg='#2b2b2b',
            fg='white'
        )
        title_label.pack(pady=20)
        
        # Control Panel
        control_frame = tk.Frame(self.root, bg='#2b2b2b')
        control_frame.pack(pady=10)
        
        # Buttons
        btn_style = {
            'font': ("Arial", 12),
            'bg': '#4a90e2',
            'fg': 'white',
            'padx': 20,
            'pady': 10,
            'relief': 'raised',
            'cursor': 'hand2'
        }
        
        self.select_btn = tk.Button(
            control_frame, 
            text="📂 Select Image", 
            command=self.select_image,
            **btn_style
        )
        self.select_btn.pack(side=tk.LEFT, padx=5)
        
        self.process_btn = tk.Button(
            control_frame, 
            text="🔧 Process Image", 
            command=self.process_image,
            state=tk.DISABLED,
            **btn_style
        )
        self.process_btn.pack(side=tk.LEFT, padx=5)
        
        self.save_btn = tk.Button(
            control_frame, 
            text="💾 Save Result", 
            command=self.save_image,
            state=tk.DISABLED,
            **btn_style
        )
        self.save_btn.pack(side=tk.LEFT, padx=5)
        
        # Parameters Frame
        params_frame = tk.Frame(self.root, bg='#2b2b2b')
        params_frame.pack(pady=10)
        
        tk.Label(
            params_frame, 
            text="Filter Strength:", 
            font=("Arial", 10),
            bg='#2b2b2b',
            fg='white'
        ).grid(row=0, column=0, padx=5)
        
        self.h_slider = tk.Scale(
            params_frame, 
            from_=1, 
            to=30, 
            orient=tk.HORIZONTAL,
            length=200,
            bg='#3b3b3b',
            fg='white',
            highlightthickness=0
        )
        self.h_slider.set(10)
        self.h_slider.grid(row=0, column=1, padx=5)
        
        tk.Label(
            params_frame, 
            text="Template Window:", 
            font=("Arial", 10),
            bg='#2b2b2b',
            fg='white'
        ).grid(row=0, column=2, padx=5)
        
        self.template_slider = tk.Scale(
            params_frame, 
            from_=1, 
            to=15, 
            orient=tk.HORIZONTAL,
            length=150,
            bg='#3b3b3b',
            fg='white',
            highlightthickness=0
        )
        self.template_slider.set(7)
        self.template_slider.grid(row=0, column=3, padx=5)
        
        # Images Display Frame
        display_frame = tk.Frame(self.root, bg='#2b2b2b')
        display_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        # Original Image Panel
        original_panel = tk.Frame(display_frame, bg='#3b3b3b', relief=tk.RIDGE, bd=2)
        original_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        tk.Label(
            original_panel, 
            text="Original Image", 
            font=("Arial", 14, "bold"),
            bg='#3b3b3b',
            fg='white'
        ).pack(pady=10)
        
        self.original_canvas = tk.Canvas(
            original_panel, 
            bg='#1e1e1e', 
            highlightthickness=0
        )
        self.original_canvas.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Drop zone text
        self.drop_text = self.original_canvas.create_text(
            300, 200,
            text="Click here or 'Select Image'\nto load an image",
            font=("Arial", 16),
            fill='#888888',
            justify=tk.CENTER
        )
        
        # Bind click to select image
        self.original_canvas.bind('<Button-1>', lambda e: self.select_image())
        
        # Try to enable drag and drop if tkinterdnd2 is available
        try:
            self.original_canvas.drop_target_register('DND_Files')
            self.original_canvas.dnd_bind('<<Drop>>', self.drop_image)
            # Update text to indicate drag-drop is available
            self.original_canvas.itemconfig(
                self.drop_text,
                text="Drag & drop an image here\nor click 'Select Image'"
            )
        except:
            # Drag and drop not available, that's okay
            pass
        
        # Denoised Image Panel
        denoised_panel = tk.Frame(display_frame, bg='#3b3b3b', relief=tk.RIDGE, bd=2)
        denoised_panel.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=5)
        
        tk.Label(
            denoised_panel, 
            text="Denoised Image", 
            font=("Arial", 14, "bold"),
            bg='#3b3b3b',
            fg='white'
        ).pack(pady=10)
        
        self.denoised_canvas = tk.Canvas(
            denoised_panel, 
            bg='#1e1e1e', 
            highlightthickness=0
        )
        self.denoised_canvas.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Status Bar
        self.status_var = tk.StringVar()
        self.status_var.set("Ready. Drop an image or click 'Select Image' to begin.")
        
        status_bar = tk.Label(
            self.root, 
            textvariable=self.status_var,
            font=("Arial", 10),
            bg='#1e1e1e',
            fg='white',
            anchor=tk.W,
            padx=10
        )
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)
    
    def drop_image(self, event):
        """Handle drag and drop event"""
        files = self.root.tk.splitlist(event.data)
        if files:
            file_path = files[0]
            # Remove curly braces if present (Windows paths)
            file_path = file_path.strip('{}')
            self.load_image(file_path)
    
    def select_image(self):
        """Open file dialog to select an image"""
        file_path = filedialog.askopenfilename(
            title="Select an Image",
            filetypes=[
                ("Image Files", "*.png *.jpg *.jpeg *.bmp *.gif *.tiff"),
                ("All Files", "*.*")
            ]
        )
        if file_path:
            self.load_image(file_path)
    
    def load_image(self, file_path):
        """Load and display the selected image"""
        try:
            self.status_var.set(f"Loading: {os.path.basename(file_path)}")
            self.root.update()
            
            # Read image with OpenCV
            img = cv2.imread(file_path)
            if img is None:
                raise ValueError("Could not read the image file")
            
            # Convert BGR to RGB
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            
            self.original_image = img
            self.current_file_path = file_path
            
            # Display the original image
            self.display_image(img, self.original_canvas)
            
            # Hide drop text
            self.original_canvas.itemconfig(self.drop_text, state='hidden')
            
            # Enable process button
            self.process_btn.config(state=tk.NORMAL)
            
            # Clear previous denoised image
            self.denoised_canvas.delete('all')
            self.denoised_image = None
            self.save_btn.config(state=tk.DISABLED)
            
            self.status_var.set(f"Loaded: {os.path.basename(file_path)} - Ready to process")
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load image:\n{str(e)}")
            self.status_var.set("Error loading image")
    
    def display_image(self, img, canvas):
        """Display image on canvas with proper scaling"""
        # Get canvas dimensions
        canvas.update()
        canvas_width = canvas.winfo_width()
        canvas_height = canvas.winfo_height()
        
        # Get image dimensions
        img_height, img_width = img.shape[:2]
        
        # Calculate scaling factor to fit image in canvas
        scale = min(canvas_width / img_width, canvas_height / img_height) * 0.95
        
        new_width = int(img_width * scale)
        new_height = int(img_height * scale)
        
        # Resize image
        img_resized = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)
        
        # Convert to PIL Image
        img_pil = Image.fromarray(img_resized)
        img_tk = ImageTk.PhotoImage(img_pil)
        
        # Display on canvas
        canvas.delete('all')
        canvas.create_image(
            canvas_width // 2,
            canvas_height // 2,
            image=img_tk,
            anchor=tk.CENTER
        )
        
        # Keep a reference to prevent garbage collection
        canvas.image = img_tk
    
    def process_image(self):
        """Apply Non-Local Means Denoising to the image"""
        if self.original_image is None:
            return
        
        try:
            self.status_var.set("Processing image... Please wait.")
            self.root.update()
            self.process_btn.config(state=tk.DISABLED)
            
            # Get parameters from sliders
            h = self.h_slider.get()
            template_window = self.template_slider.get()
            search_window = template_window * 3
            
            # Apply Non-Local Means Denoising
            self.denoised_image = cv2.fastNlMeansDenoisingColored(
                self.original_image, 
                None, 
                h=h,
                hColor=h,
                templateWindowSize=template_window,
                searchWindowSize=search_window
            )
            
            # Display the denoised image
            self.display_image(self.denoised_image, self.denoised_canvas)
            
            # Enable save button
            self.save_btn.config(state=tk.NORMAL)
            self.process_btn.config(state=tk.NORMAL)
            
            self.status_var.set("Processing complete! You can now save the result.")
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to process image:\n{str(e)}")
            self.status_var.set("Error processing image")
            self.process_btn.config(state=tk.NORMAL)
    
    def save_image(self):
        """Save the denoised image"""
        if self.denoised_image is None:
            return
        
        try:
            # Suggest filename
            if self.current_file_path:
                base_name = os.path.splitext(os.path.basename(self.current_file_path))[0]
                default_name = f"{base_name}_denoised.png"
            else:
                default_name = "denoised_image.png"
            
            file_path = filedialog.asksaveasfilename(
                title="Save Denoised Image",
                defaultextension=".png",
                initialfile=default_name,
                filetypes=[
                    ("PNG files", "*.png"),
                    ("JPEG files", "*.jpg"),
                    ("All Files", "*.*")
                ]
            )
            
            if file_path:
                # Convert RGB back to BGR for OpenCV
                img_bgr = cv2.cvtColor(self.denoised_image, cv2.COLOR_RGB2BGR)
                cv2.imwrite(file_path, img_bgr)
                
                self.status_var.set(f"Saved: {os.path.basename(file_path)}")
                messagebox.showinfo("Success", f"Image saved successfully:\n{file_path}")
        
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save image:\n{str(e)}")
            self.status_var.set("Error saving image")


def main():
    root = tk.Tk()
    
    # Try to enable drag and drop support
    try:
        from tkinterdnd2 import DND_FILES, TkinterDnD
        root = TkinterDnD.Tk()
    except ImportError:
        print("Note: tkinterdnd2 not installed. Drag-and-drop will use fallback method.")
        print("Install with: pip install tkinterdnd2")
    
    app = ImageDenoisingGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()