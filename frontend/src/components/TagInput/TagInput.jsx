import React, { useState } from 'react';
import { X } from 'lucide-react';
import './TagInput.scss';

const TagInput = ({ tags, onChange }) => {
  const [input, setInput] = useState('');

  const addTag = (value) => {
    const tag = value.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  };

  const removeTag = (tag) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="tag-input">
      <div className="tag-input-tags">
        {tags.map((tag) => (
          <span key={tag} className="tag-input-pill">
            {tag}
            <button type="button" onClick={() => removeTag(tag)}><X size={12} /></button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input && addTag(input)}
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
        />
      </div>
    </div>
  );
};

export default TagInput;
