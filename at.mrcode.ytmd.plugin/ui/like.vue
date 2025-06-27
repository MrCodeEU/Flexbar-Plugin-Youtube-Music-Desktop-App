<template>
  <v-container class="pa-4" v-if="isInitialized">
    <v-row>
      <v-col cols="12">
        <v-card elevation="2" class="rounded-lg">
          <v-card-item>
            <v-card-title class="text-h6 font-weight-regular">Like Button Settings</v-card-title>
            <v-card-subtitle>Customize appearance and behavior</v-card-subtitle>
          </v-card-item>
          <v-card-text class="pt-0">
            <v-row dense>
              <!-- Liked Color Picker -->
              <v-col cols="12" sm="6">
                <v-menu activator="parent" :close-on-content-click="false">
                  <template v-slot:activator="{ props: menuProps }">
                    <v-text-field
                      v-bind="menuProps"
                      v-model="modelValue.data.likedColor"
                      label="Liked Color"
                      hint="Icon color when liked"
                      persistent-hint
                      density="compact"
                      variant="outlined"
                    >
                      <template v-slot:prepend-inner>
                        <div :style="{ backgroundColor: modelValue.data.likedColor, width: '20px', height: '20px', marginRight: '8px', borderRadius: '4px', border: '1px solid #ccc' }"></div>
                      </template>
                    </v-text-field>
                  </template>
                  <v-color-picker 
                    v-model="modelValue.data.likedColor" 
                    elevation="10"
                    :modes="['hex']"
                    mode="hex"
                  ></v-color-picker>
                </v-menu>
              </v-col>
              
              <!-- Unliked Color Picker -->
              <v-col cols="12" sm="6">
                <v-menu activator="parent" :close-on-content-click="false">
                  <template v-slot:activator="{ props: menuProps }">
                    <v-text-field
                      v-bind="menuProps"
                      v-model="modelValue.data.unlikedColor"
                      label="Not Liked Color"
                      hint="Icon color when not liked"
                      persistent-hint
                      density="compact"
                      variant="outlined"
                    >
                      <template v-slot:prepend-inner>
                        <div :style="{ backgroundColor: modelValue.data.unlikedColor, width: '20px', height: '20px', marginRight: '8px', borderRadius: '4px', border: '1px solid #ccc' }"></div>
                      </template>
                    </v-text-field>
                  </template>
                  <v-color-picker 
                    v-model="modelValue.data.unlikedColor" 
                    elevation="10"
                    :modes="['hex']"
                    mode="hex"
                  ></v-color-picker>
                </v-menu>
              </v-col>
              
              <!-- Background Color Picker -->
              <v-col cols="12" sm="6">
                <v-menu activator="parent" :close-on-content-click="false">
                  <template v-slot:activator="{ props: menuProps }">
                    <v-text-field
                      v-bind="menuProps"
                      v-model="modelValue.data.likeBgColor"
                      label="Background Color"
                      hint="Button background color"
                      persistent-hint
                      density="compact"
                      variant="outlined"
                    >
                      <template v-slot:prepend-inner>
                        <div :style="{ backgroundColor: modelValue.data.likeBgColor, width: '20px', height: '20px', marginRight: '8px', borderRadius: '4px', border: '1px solid #ccc' }"></div>
                      </template>
                    </v-text-field>
                  </template>
                  <v-color-picker 
                    v-model="modelValue.data.likeBgColor" 
                    elevation="10"
                    :modes="['hex']"
                    mode="hex"
                  ></v-color-picker>
                </v-menu>
              </v-col>
            </v-row>

            <v-divider class="my-4"></v-divider>

            <!-- Information Section -->
            <v-alert
              type="info"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              <div class="text-body-2">
                <strong>How it works:</strong><br>
                • Red (filled) = Liked track<br>
                • White (outline) = Not liked / Indifferent<br>
                • Gray (dimmed) = Unknown status<br>
                • Click to toggle like status
              </div>
            </v-alert>

            <v-alert
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              <div class="text-body-2">
                <strong>Note:</strong> YouTube Music uses a three-state system: Like, Dislike, and Indifferent. This button toggles between Like and Indifferent states.
              </div>
            </v-alert>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
const DEFAULT_MODEL_VALUE = {
  data: {
    likedColor: '#FF0000',    // YouTube Music red
    unlikedColor: '#FFFFFF',  // White
    likeBgColor: '#424242'    // Dark gray background
  },
  title: 'Like'
};

export default {
  name: 'YouTubeMusicLikeButton',
  props: {
    modelValue: {
      type: Object,
      required: true
    },
  },
  emits: ['update:modelValue'],
  data() {
    return {
      isInitialized: false,
    };
  },
  methods: {
    initializeModelValue() {
      if (!this.modelValue.data) this.modelValue.data = {};
      if (!this.modelValue.style) this.modelValue.style = {};
      
      this.modelValue.data = { ...DEFAULT_MODEL_VALUE.data, ...this.modelValue.data };
      this.modelValue.title = this.modelValue.title || DEFAULT_MODEL_VALUE.title;
      
      this.isInitialized = true;
    },
  },
  created() {
    this.initializeModelValue();
  }
};
</script>

<style scoped>
:deep(.v-list-item__append > .v-input) {
  margin-left: auto;
}

:deep(.v-list-subheader) {
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}
</style>