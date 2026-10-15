// Bounded criteria/sort parser shared by native records and bound controls. MIT.
#include "recordset.hpp"
#include <cwctype>
namespace vb6 {
namespace {
struct Token { Text text; enum Kind { Word,String,Date,Number,Symbol,End } kind=End; };
class Query {
  const std::vector<RecordsetColumn>& columns;
  Text input; size_t offset=0,tokens=0,depth=0; Token next;
  [[noreturn]] void bad()const {fail(3001,"Invalid native Recordset criteria");}
  void scan() {
    if(++tokens>4096)bad();
    while(offset<input.size()&&std::iswspace(input[offset]))++offset;
    if(offset==input.size()){next={};return;}
    char16_t c=input[offset++];Text text;
    if(c==u'\''||c==u'"'||c==u'['||c==u'#') {
      const auto end=c==u'['?u']':c;
      while(offset<input.size()) {
        auto ch=input[offset++];
        if(ch==end) {
          if(offset<input.size()&&input[offset]==end&&c!=u'#'){++offset;text+=ch;continue;}
          next={text,c==u'['?Token::Word:c==u'#'?Token::Date:Token::String};return;
        }
        text+=ch;
      }
      bad();
    }
    if((c>=u'0'&&c<=u'9')||c==u'-'||c==u'+'||c==u'.'||c==u'$') {
      if(c!=u'$')text+=c;
      while(offset<input.size()) {
        c=input[offset];
        if((c>=u'0'&&c<=u'9')||c==u'.'||c==u'e'||c==u'E'||c==u'+'||c==u'-'){text+=c;++offset;}else break;
      }
      next={text,Token::Number};return;
    }
    if(std::iswalnum(c)||c==u'_') {
      text+=c;
      while(offset<input.size()&&(std::iswalnum(input[offset])||input[offset]==u'_'))text+=input[offset++];
      next={text,Token::Word};return;
    }
    text+=c;
    if(offset<input.size()&&(c==u'<'||c==u'>')&&(input[offset]==u'='||(c==u'<'&&input[offset]==u'>')))text+=input[offset++];
    next={text,Token::Symbol};
  }
  Value literal() {
    const auto token=next;scan();
    if(token.kind==Token::String)return Value::string(token.text);
    if(token.kind==Token::Date)return parseDate(Value::string(token.text));
    if(token.kind==Token::Number){try{return Value::decimal(Decimal::parse(token.text));}catch(const Error&){bad();}}
    if(token.kind==Token::Word){auto s=changeCase(token.text,false);if(s==u"true")return Value::boolean(true);if(s==u"false")return Value::boolean(false);if(s==u"null")return Value::null();}
    bad();
  }
  RecordsetFilter clause() {
    if(++depth>32)bad();
    RecordsetFilter result;
    if(take(u"(")){result=expression();if(!take(u")"))bad();}
    else {
      if(next.kind!=Token::Word)bad();const auto index=recordsetColumn(columns,Value::string(next.text));scan();
      if(take(u"is")) {const bool inverse=take(u"not");if(!take(u"null"))bad();result=[index,inverse](const RecordsetRow& row){return (row.values.at(index).type==Type::Null)!=inverse;};}
      else {
        auto op=changeCase(next.text,false);scan();
        if(op!=u"="&&op!=u"<>"&&op!=u"<"&&op!=u">"&&op!=u"<="&&op!=u">="&&op!=u"like")bad();
        auto value=literal();if(value.type==Type::Null)bad();
        // Convert against the declared type before changing the current view.
        // DefinedSize constrains stored data, not comparison literals.
        auto column=columns.at(index);column.size=0;
        const std::set<int> numeric={2,3,4,5,6,14,16,17,18,19,131};
        if(numeric.count(column.type)){
          // A fractional numeric literal must not be rounded to the storage
          // type: an Integer field containing 2 satisfies ID > 1.5.
          if(value.type==Type::String){try{value=Value::decimal(Decimal::parse(value.string()));}catch(const Error&){bad();}}
          (void)value.number();
        }else value=recordsetCoerce(column,std::move(value));
        if(op==u"like") {
          if(value.type!=Type::String)bad();auto pattern=changeCase(value.string(),false);
          for(auto& ch:pattern)if(ch==u'%')ch=u'*';
          const bool leading=!pattern.empty()&&pattern.front()==u'*',trailing=!pattern.empty()&&pattern.back()==u'*';
          if(leading)pattern.erase(pattern.begin());if(trailing&&!pattern.empty())pattern.pop_back();
          if(pattern.find_first_of(u"*?[]")!=Text::npos)bad();
          result=[index,pattern,leading,trailing](const RecordsetRow& row){
            const auto& item=row.values.at(index);if(item.type==Type::Null)return false;
            const auto s=changeCase(item.string(),false);
            if(leading&&trailing)return s.find(pattern)!=Text::npos;
            if(leading)return s.size()>=pattern.size()&&s.compare(s.size()-pattern.size(),pattern.size(),pattern)==0;
            if(trailing)return s.rfind(pattern,0)==0;return s==pattern;
          };
        }else { result=[index,value,op](const RecordsetRow& row){
          const auto& item=row.values.at(index);if(item.type==Type::Null)return false;const int c=recordsetCompare(item,value);
          return op==u"="?c==0:op==u"<>"?c!=0:op==u"<"?c<0:op==u">"?c>0:op==u"<="?c<=0:c>=0;
        }; }
      }
    }
    --depth;return result;
  }
  RecordsetFilter expression() {
    auto left=clause();size_t count=0;
    // ADO does not give AND a higher precedence than OR; parentheses are explicit.
    while(is(u"and")||is(u"or")) {
      if(++count>256)bad();const bool conjunction=take(u"and");if(!conjunction)scan();auto right=clause();
      left=[left=std::move(left),right=std::move(right),conjunction](const RecordsetRow& row){return conjunction?(left(row)&&right(row)):(left(row)||right(row));};
    }
    return left;
  }
  bool is(const Text& text)const {return changeCase(next.text,false)==text&&next.kind!=Token::String;}
  bool take(const Text& text){if(!is(text))return false;scan();return true;}
public:
  Query(const std::vector<RecordsetColumn>& c,Text s):columns(c),input(std::move(s)){if(input.size()>16384)bad();scan();}
  RecordsetFilter filter(){if(next.kind==Token::End)return {};auto result=expression();if(next.kind!=Token::End)bad();return result;}
  std::vector<RecordsetSort> sort(){
    std::vector<RecordsetSort> result;
    while(next.kind!=Token::End){
      if(next.kind!=Token::Word||result.size()>=columns.size())bad();auto index=recordsetColumn(columns,Value::string(next.text));scan();
      bool descending=take(u"desc");if(!descending)take(u"asc");
      if(std::any_of(result.begin(),result.end(),[index](auto item){return item.column==index;}))bad();result.push_back({index,descending});
      if(next.kind==Token::End)break;if(!take(u",")||next.kind==Token::End)bad();
    }
    return result;
  }
};
}
RecordsetFilter recordsetFilter(const std::vector<RecordsetColumn>& columns,const Text& text){return Query(columns,text).filter();}
std::vector<RecordsetSort> recordsetSort(const std::vector<RecordsetColumn>& columns,const Text& text){return Query(columns,text).sort();}
} // namespace vb6
