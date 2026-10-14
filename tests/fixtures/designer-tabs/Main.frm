VERSION 5.00
' Synthetic regression for issue #116; not a Microsoft project or screenshot.
Begin VB.Form Main
   Caption = "SSTab designer regression"
   ClientWidth = 9600
   ClientHeight = 6600
   Begin TabDlg.SSTab Pages
      Left = 300
      Top = 300
      Width = 7500
      Height = 4500
      Tabs = 3
      Tab = 0
      TabsPerRow = 3
      TabHeight = 360
      TabCaption(0) = "General"
      TabCaption(1) = "Details"
      TabCaption(2) = "Advanced"
      Tab(0).ControlEnabled = -1
      Tab(0).Control(0) = "Text1(0)"
      Tab(0).ControlCount = 1
      Tab(1).ControlEnabled = 0
      Tab(1).Control(0) = "Text1(1)"
      Tab(1).Control(1) = "Group1"
      Tab(1).ControlCount = 2
      Tab(2).ControlEnabled = 0
      Tab(2).Control(0) = "Timer1"
      Tab(2).ControlCount = 1
      Begin VB.TextBox Text1
         Index = 0
         Text = "First page"
         Left = 300
         Top = 600
         Width = 2100
         Height = 315
         TabIndex = 0
      End
      Begin VB.TextBox Text1
         Index = 1
         Text = "Second page"
         Left = -74700
         Top = 600
         Width = 2100
         Height = 315
         TabIndex = 1
      End
      Begin VB.Frame Group1
         Caption = "Nested container"
         Left = -74400
         Top = 1350
         Width = 4500
         Height = 1800
         TabIndex = 2
         Begin VB.CheckBox Check1
            Caption = "Design-only selection"
            Left = 300
            Top = 600
            Width = 2700
            Height = 315
            Enabled = 0
            Value = 0
            TabIndex = 3
         End
      End
      Begin VB.Timer Timer1
         Left = -74400
         Top = 900
         Interval = 0
         Enabled = 0
      End
   End
End
Attribute VB_Name = "Main"
Option Explicit

Private Sub Pages_Click(PreviousTab As Integer)
    Debug.Print "Tab", Pages.Tab, "Previous", PreviousTab
End Sub
